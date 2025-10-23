#!/bin/bash

# Brainwave Installation and Run Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
PORT=3005
HOST="0.0.0.0"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to setup environment
setup_environment() {
    print_info "Setting up environment..."
    
    # Check Python version
    if ! command_exists python3; then
        print_error "Python 3 is not installed. Please install Python 3.8 or higher."
        exit 1
    fi
    
    # Check Python version is 3.8+
    PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
    REQUIRED_VERSION="3.8"
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
        print_error "Python $REQUIRED_VERSION or higher is required. Found: $PYTHON_VERSION"
        exit 1
    fi
    
    print_info "Python $PYTHON_VERSION detected ✓"
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        print_info "Creating virtual environment..."
        python3 -m venv venv
    else
        print_info "Virtual environment already exists ✓"
    fi
    
    # Activate virtual environment
    print_info "Activating virtual environment..."
    source venv/bin/activate
    
    # Upgrade pip
    print_info "Upgrading pip..."
    pip install --quiet --upgrade pip
    
    # Install dependencies
    print_info "Installing dependencies..."
    pip install --quiet -r requirements.txt
    
    print_info "Environment setup complete ✓"
}

# Function to check environment variables
check_env_vars() {
    if [ -z "$OPENAI_API_KEY" ]; then
        print_warning "OPENAI_API_KEY is not set!"
        print_info "Please set it using: export OPENAI_API_KEY='your-api-key'"
        print_info "Or create a .env file with: OPENAI_API_KEY=your-api-key"
        
        # Check if .env file exists
        if [ -f ".env" ]; then
            print_info "Loading .env file..."
            export $(cat .env | grep -v '^#' | xargs)
            
            if [ -z "$OPENAI_API_KEY" ]; then
                print_error "OPENAI_API_KEY not found in .env file"
                exit 1
            fi
        else
            print_error "No OPENAI_API_KEY found. Please set it before running."
            exit 1
        fi
    else
        print_info "OPENAI_API_KEY detected ✓"
    fi
}

# Function to run the server
run_server() {
    print_info "Starting Brainwave server..."
    print_info "Server will be available at http://localhost:${PORT}"
    print_info "Press Ctrl+C to stop the server"
    
    # Check if uvicorn is installed
    if ! pip show uvicorn >/dev/null 2>&1; then
        print_error "Uvicorn is not installed. Running setup first..."
        setup_environment
    fi
    
    # Activate virtual environment if not already activated
    if [ -z "$VIRTUAL_ENV" ]; then
        if [ -d "venv" ]; then
            source venv/bin/activate
        else
            setup_environment
        fi
    fi
    
    # Check environment variables
    check_env_vars
    
    # Run the server
    uvicorn realtime_server:app --host $HOST --port $PORT --reload
}

# Function to run tests
run_tests() {
    print_info "Running tests..."
    
    # Activate virtual environment if not already activated
    if [ -z "$VIRTUAL_ENV" ]; then
        if [ -d "venv" ]; then
            source venv/bin/activate
        else
            setup_environment
        fi
    fi
    
    # Set test environment variables
    export OPENAI_API_KEY='test_key'
    export GOOGLE_API_KEY='test_key'
    
    # Run pytest
    if command_exists pytest; then
        pytest -v tests/
    else
        print_error "pytest is not installed. Installing..."
        pip install pytest pytest-asyncio pytest-mock httpx
        pytest -v tests/
    fi
}

# Function to clean up
clean() {
    print_info "Cleaning up..."
    
    # Remove virtual environment
    if [ -d "venv" ]; then
        rm -rf venv
        print_info "Removed virtual environment"
    fi
    
    # Remove __pycache__ directories
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    print_info "Removed cache files"
    
    print_info "Cleanup complete ✓"
}

# Function to show help
show_help() {
    echo "Brainwave Installation and Run Script"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  run       - Set up environment and run the server (default)"
    echo "  setup     - Only set up the environment without running"
    echo "  test      - Run the test suite"
    echo "  clean     - Clean up virtual environment and cache files"
    echo "  help      - Show this help message"
    echo ""
    echo "Options:"
    echo "  --port PORT   - Specify server port (default: 3005)"
    echo "  --host HOST   - Specify server host (default: 0.0.0.0)"
    echo ""
    echo "Examples:"
    echo "  $0 run                  # Run server on default port"
    echo "  $0 run --port 8000      # Run server on port 8000"
    echo "  $0 setup                # Only set up environment"
    echo "  $0 test                 # Run tests"
}

# Parse command line arguments
COMMAND=${1:-run}

# Parse additional options
shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            PORT="$2"
            shift 2
            ;;
        --host)
            HOST="$2"
            shift 2
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main script logic
case $COMMAND in
    run)
        run_server
        ;;
    setup)
        setup_environment
        check_env_vars
        print_info "Setup complete! Run './install.sh run' to start the server."
        ;;
    test)
        run_tests
        ;;
    clean)
        clean
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac