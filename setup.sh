#!/bin/bash
# local-asr-server setup script for macOS and other systems
set -e

echo "============================================="
echo "Starting local-asr-server setup..."
echo "============================================="

OS="$(uname -s)"

if [ "$OS" = "Darwin" ]; then
    echo "macOS detected."
    if ! command -v brew &> /dev/null; then
        echo "WARNING: Homebrew not found. Homebrew is required to install system dependencies."
        echo "Please install Homebrew from https://brew.sh/ and run this script again."
        exit 1
    fi

    echo "Installing system dependencies via Homebrew (ffmpeg, blackhole-2ch)..."
    brew install ffmpeg blackhole-2ch
    
    echo ""
    echo "============================================="
    echo "macOS AUDIO SETUP:"
    echo "Multi-Output devices are created automatically"
    echo "when you start a recording. No manual setup needed."
    echo ""
    echo "Run 'local-asr doctor' to verify the configuration."
    echo "============================================="
    echo ""
else
    echo "Non-macOS system ($OS) detected."
    echo "Please make sure 'ffmpeg' is installed manually via your package manager."
fi

# Install Python package and dependencies
if command -v uv &> /dev/null; then
    echo "Using 'uv' to install package in editable mode..."
    uv pip install -e .
else
    echo "Using 'pip' to install package in editable mode..."
    pip install -e .
fi

echo "============================================="
echo "Setup completed successfully!"
echo "Run the server with: local-asr serve"
echo "============================================="
