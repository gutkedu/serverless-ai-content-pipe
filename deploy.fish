#!/usr/bin/env fish

# AWS Strands Deployment Script
# This script deploys the AI Content Pipeline with AWS Strands architecture

set -g RED '\033[0;31m'
set -g GREEN '\033[0;32m'
set -g YELLOW '\033[1;33m'
set -g NC '\033[0m' # No Color

function print_header
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $argv[1]"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
end

function print_success
    echo -e "$GREEN✓ $argv[1]$NC"
end

function print_error
    echo -e "$RED✗ $argv[1]$NC"
end

function print_warning
    echo -e "$YELLOW⚠ $argv[1]$NC"
end

function check_prerequisites
    print_header "Checking Prerequisites"
    
    # Check AWS CLI
    if not command -v aws &> /dev/null
        print_error "AWS CLI is not installed"
        echo "Install from: https://aws.amazon.com/cli/"
        return 1
    end
    print_success "AWS CLI installed"
    
    # Check Node.js
    if not command -v node &> /dev/null
        print_error "Node.js is not installed"
        echo "Install from: https://nodejs.org/"
        return 1
    end
    print_success "Node.js installed: "(node --version)
    
    # Check CDK
    if not command -v cdk &> /dev/null
        print_error "AWS CDK is not installed"
        echo "Install with: npm install -g aws-cdk"
        return 1
    end
    print_success "AWS CDK installed: "(cdk --version)
    
    # Check AWS credentials
    if not aws sts get-caller-identity &> /dev/null
        print_error "AWS credentials not configured"
        echo "Configure with: aws configure"
        return 1
    end
    print_success "AWS credentials configured"
    
    set -g AWS_ACCOUNT_ID (aws sts get-caller-identity --query Account --output text)
    set -g AWS_REGION (aws configure get region)
    or set -g AWS_REGION "us-east-1"
    
    echo ""
    echo "  Account ID: $AWS_ACCOUNT_ID"
    echo "  Region: $AWS_REGION"
    
    return 0
end

function install_dependencies
    print_header "Installing Dependencies"
    
    # Install infra dependencies
    echo "Installing infrastructure dependencies..."
    cd infra
    npm install
    if test $status -ne 0
        print_error "Failed to install infrastructure dependencies"
        return 1
    end
    print_success "Infrastructure dependencies installed"
    
    # Install backend dependencies
    echo ""
    echo "Installing backend dependencies..."
    cd ../backend/nodejs
    npm install
    if test $status -ne 0
        print_error "Failed to install backend dependencies"
        return 1
    end
    print_success "Backend dependencies installed"
    
    cd ../..
    return 0
end

function bootstrap_cdk
    print_header "Bootstrapping CDK"
    
    cd infra
    
    # Check if already bootstrapped
    if aws cloudformation describe-stacks --stack-name CDKToolkit &> /dev/null
        print_success "CDK already bootstrapped"
    else
        echo "Bootstrapping CDK for account $AWS_ACCOUNT_ID in region $AWS_REGION..."
        cdk bootstrap aws://$AWS_ACCOUNT_ID/$AWS_REGION
        if test $status -ne 0
            print_error "CDK bootstrap failed"
            return 1
        end
        print_success "CDK bootstrapped successfully"
    end
    
    cd ..
    return 0
end

function deploy_stacks
    print_header "Deploying Stacks"
    
    cd infra
    
    echo "Deploying stateful stack (S3, SSM, EventBridge)..."
    cdk deploy AiContentPipeStatefulStack --require-approval never
    if test $status -ne 0
        print_error "Stateful stack deployment failed"
        return 1
    end
    print_success "Stateful stack deployed"
    
    echo ""
    echo "Deploying stateless stack (Lambdas, Bedrock Agent with Strands)..."
    cdk deploy AiContentPipeStatelessStack --require-approval never
    if test $status -ne 0
        print_error "Stateless stack deployment failed"
        return 1
    end
    print_success "Stateless stack deployed"
    
    cd ..
    return 0
end

function configure_parameters
    print_header "Configuration Required"
    
    print_warning "You need to configure SSM parameters before the system can work:"
    echo ""
    echo "1. NewsAPI Key:"
    echo "   aws ssm put-parameter \\"
    echo "     --name /ai-content-pipe/news-api-key \\"
    echo "     --value 'YOUR_NEWS_API_KEY' \\"
    echo "     --type SecureString \\"
    echo "     --overwrite"
    echo ""
    echo "2. Pinecone API Key:"
    echo "   aws ssm put-parameter \\"
    echo "     --name /ai-content-pipe/pinecone-api-key \\"
    echo "     --value 'YOUR_PINECONE_API_KEY' \\"
    echo "     --type SecureString \\"
    echo "     --overwrite"
    echo ""
    echo "3. From Email (must be verified in SES):"
    echo "   aws ssm put-parameter \\"
    echo "     --name /ai-content-pipe/from-email \\"
    echo "     --value 'verified@yourdomain.com' \\"
    echo "     --type String \\"
    echo "     --overwrite"
    echo ""
    echo "4. Default To Email:"
    echo "   aws ssm put-parameter \\"
    echo "     --name /ai-content-pipe/default-to-email \\"
    echo "     --value 'recipient@example.com' \\"
    echo "     --type String \\"
    echo "     --overwrite"
    echo ""
end

function prepare_agent
    print_header "Preparing Bedrock Agent"
    
    # Get agent ID from stack outputs
    set AGENT_ID (aws cloudformation describe-stacks \
        --stack-name AiContentPipeStatelessStack \
        --query 'Stacks[0].Outputs[?OutputKey==`AgentId`].OutputValue' \
        --output text 2>/dev/null)
    
    if test -z "$AGENT_ID"
        print_warning "Could not retrieve Agent ID from stack outputs"
        print_warning "You may need to prepare the agent manually:"
        echo "  aws bedrock-agent prepare-agent --agent-id YOUR_AGENT_ID"
        return 0
    end
    
    echo "Preparing agent: $AGENT_ID"
    aws bedrock-agent prepare-agent --agent-id $AGENT_ID
    if test $status -ne 0
        print_error "Failed to prepare agent"
        print_warning "You may need to prepare it manually later"
        return 0
    end
    
    print_success "Agent prepared successfully"
    return 0
end

function show_outputs
    print_header "Deployment Outputs"
    
    # Get stack outputs
    set AGENT_ID (aws cloudformation describe-stacks \
        --stack-name AiContentPipeStatelessStack \
        --query 'Stacks[0].Outputs[?OutputKey==`AgentId`].OutputValue' \
        --output text 2>/dev/null)
    
    set AGENT_ALIAS_ID (aws cloudformation describe-stacks \
        --stack-name AiContentPipeStatelessStack \
        --query 'Stacks[0].Outputs[?OutputKey==`AgentAliasId`].OutputValue' \
        --output text 2>/dev/null)
    
    set FUNCTION_URL (aws cloudformation describe-stacks \
        --stack-name AiContentPipeStatelessStack \
        --query 'Stacks[0].Outputs[?OutputKey==`AgentInvocationUrl`].OutputValue' \
        --output text 2>/dev/null)
    
    echo "Agent ID: $AGENT_ID"
    echo "Agent Alias ID: $AGENT_ALIAS_ID"
    echo "Function URL: $FUNCTION_URL"
    echo ""
    echo "Test with:"
    echo "  curl -X POST '$FUNCTION_URL' \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"topic\":\"AI\",\"recipients\":[\"your@email.com\"],\"maxResults\":5}'"
    echo ""
end

function main
    print_header "🚀 AWS Strands AI Content Pipeline Deployment"
    
    # Check prerequisites
    if not check_prerequisites
        print_error "Prerequisites check failed"
        return 1
    end
    
    # Install dependencies
    if not install_dependencies
        print_error "Dependency installation failed"
        return 1
    end
    
    # Bootstrap CDK if needed
    if not bootstrap_cdk
        print_error "CDK bootstrap failed"
        return 1
    end
    
    # Deploy stacks
    if not deploy_stacks
        print_error "Stack deployment failed"
        return 1
    end
    
    # Show configuration steps
    configure_parameters
    
    # Prepare agent
    prepare_agent
    
    # Show outputs
    show_outputs
    
    print_header "✅ Deployment Complete!"
    echo ""
    echo "Next steps:"
    echo "1. Configure SSM parameters (see above)"
    echo "2. Verify email addresses in AWS SES"
    echo "3. Test the agent invocation"
    echo ""
    echo "Documentation: docs/AWS_STRANDS_GUIDE.md"
    echo ""
end

# Run main function
main
