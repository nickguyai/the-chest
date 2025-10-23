#!/bin/bash

# Gammawave Run Script
# Easy startup script for development

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_DIR="$SCRIPT_DIR/python"

# Check if we're in the right directory
if [[ ! -f "$PYTHON_DIR/realtime_server.py" ]]; then
    log_error "Cannot find realtime_server.py. Please run this script from the gammawave directory."
    exit 1
fi

# Change to Python directory
cd "$PYTHON_DIR"

log_info "Starting Gammawave..."

# Check if virtual environment exists
if [[ ! -d "venv" ]]; then
    log_step "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
log_step "Activating virtual environment..."
source venv/bin/activate

# Install/upgrade dependencies
log_step "Installing dependencies..."
pip install -r requirements.txt

# Check API keys
if [[ -z "$OPENAI_API_KEY" ]]; then
    log_warn "OPENAI_API_KEY is not set"
    log_warn "Set it with: export OPENAI_API_KEY=your_key_here"
fi

if [[ -z "$GOOGLE_API_KEY" ]]; then
    log_warn "GOOGLE_API_KEY is not set"
    log_warn "Set it with: export GOOGLE_API_KEY=your_key_here"
fi

# Start the server
log_info "Starting server on http://localhost:3005"
log_info "Press Ctrl+C to stop"
echo

uvicorn realtime_server:app --host 0.0.0.0 --port 3005 --reload