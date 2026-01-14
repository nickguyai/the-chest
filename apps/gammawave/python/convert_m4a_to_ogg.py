#!/usr/bin/env python3
"""
Convert M4A audio files to OGG format.
Usage: python convert_m4a_to_ogg.py <input_file.m4a> [output_file.ogg]
"""

import sys
import os
from pathlib import Path
import subprocess
import argparse

def check_dependencies():
    """Check if ffmpeg is installed."""
    try:
        subprocess.run(['ffmpeg', '-version'], 
                      capture_output=True, 
                      check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def convert_m4a_to_ogg(input_path, output_path=None):
    """
    Convert M4A file to OGG format using ffmpeg.
    
    Args:
        input_path (str): Path to input M4A file
        output_path (str): Path for output OGG file (optional)
    
    Returns:
        str: Path to the converted OGG file
    """
    input_path = Path(input_path)
    
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    
    if input_path.suffix.lower() != '.m4a':
        raise ValueError(f"Input file must be .m4a, got: {input_path.suffix}")
    
    # Generate output path if not provided
    if output_path is None:
        output_path = input_path.with_suffix('.ogg')
    else:
        output_path = Path(output_path)
    
    # Create output directory if it doesn't exist
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"Converting: {input_path} -> {output_path}")
    
    # Run ffmpeg conversion
    cmd = [
        'ffmpeg',
        '-i', str(input_path),
        '-c:a', 'libvorbis',  # OGG Vorbis codec
        '-q:a', '5',          # Quality setting (0-10, 5 is good quality)
        '-y',                 # Overwrite output file if it exists
        str(output_path)
    ]
    
    try:
        result = subprocess.run(cmd, 
                              capture_output=True, 
                              text=True, 
                              check=True)
        print(f"✓ Conversion completed successfully!")
        print(f"  Output: {output_path}")
        print(f"  Size: {output_path.stat().st_size / 1024 / 1024:.2f} MB")
        return str(output_path)
    except subprocess.CalledProcessError as e:
        print(f"✗ Conversion failed!")
        print(f"Error: {e.stderr}")
        raise

def main():
    parser = argparse.ArgumentParser(
        description='Convert M4A audio files to OGG format',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python convert_m4a_to_ogg.py input.m4a
  python convert_m4a_to_ogg.py input.m4a output.ogg
  python convert_m4a_to_ogg.py "/path/with spaces/input.m4a"
        """
    )
    
    parser.add_argument('input_file', help='Input M4A file path')
    parser.add_argument('output_file', nargs='?', help='Output OGG file path (optional)')
    
    args = parser.parse_args()
    
    # Check ffmpeg dependency
    if not check_dependencies():
        print("Error: ffmpeg is not installed or not in PATH")
        print("Please install ffmpeg:")
        print("  macOS: brew install ffmpeg")
        print("  Ubuntu/Debian: sudo apt install ffmpeg")
        print("  Windows: Download from https://ffmpeg.org/")
        sys.exit(1)
    
    try:
        convert_m4a_to_ogg(args.input_file, args.output_file)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()