import subprocess
import os
import signal
import sys
import threading
from pathlib import Path

# Define server configurations
servers = [
    {"name": "SBI", "path": "servers/sbi", "port": 5001},
    {"name": "HDFC", "path": "servers/hdfc", "port": 5002},
    {"name": "ICICI", "path": "servers/icici", "port": 5003}
]

processes = []

def read_output(process, server_name, stream_type):
    """Read and print output from subprocess"""
    stream = process.stdout if stream_type == "stdout" else process.stderr
    for line in iter(stream.readline, ''):
        if line:
            prefix = f"[{server_name}]"
            print(f"{prefix} {line.rstrip()}")
    stream.close()

def signal_handler(sig, frame):
    print('\n🛑 Shutting down all servers...')
    for process in processes:
        try:
            process.terminate()
            process.wait(timeout=5)
        except:
            process.kill()
    sys.exit(0)

# Register signal handler for graceful shutdown
signal.signal(signal.SIGINT, signal_handler)

print('🚀 Starting all bank proxy servers...\n')

for server in servers:
    server_path = Path(server["path"])
    
    if not server_path.exists():
        print(f"❌ Directory {server['path']} does not exist!")
        continue
    
    if not (server_path / "app.py").exists():
        print(f"❌ app.py not found in {server['path']}!")
        continue
    
    try:
        # Start the server process
        process = subprocess.Popen(
            ["python", "app.py"],
            cwd=server_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        processes.append(process)
        
        # Start threads to read stdout and stderr
        threading.Thread(target=read_output, args=(process, server['name'], "stdout"), daemon=True).start()
        threading.Thread(target=read_output, args=(process, server['name'], "stderr"), daemon=True).start()
        
        print(f"✅ {server['name']} Server started on port {server['port']}")
        
    except Exception as e:
        print(f"❌ Failed to start {server['name']} server: {e}")

print(f"\n🎉 All servers started! Running on ports: 5001 (SBI), 5002 (HDFC), 5003 (ICICI)")
print("Press Ctrl+C to stop all servers\n")

# Keep the script running and monitor processes
try:
    while True:
        for i, process in enumerate(processes[:]):  # Create a copy to iterate
            if process.poll() is not None:
                returncode = process.returncode
                print(f"❌ {servers[i]['name']} server has stopped with exit code {returncode}")
                processes.remove(process)
        
        if not processes:
            print("All servers have stopped")
            break
        
        # Small sleep to prevent busy waiting
        import time
        time.sleep(0.5)
            
except KeyboardInterrupt:
    signal_handler(None, None)