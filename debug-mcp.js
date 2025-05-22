const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path to your MCP server
const mcpPath = path.join(__dirname, 'build', 'index.js');

// Spawn the MCP server with detailed stdout/stderr logging
const mcpProcess = spawn('node', [mcpPath], {
  stdio: ['pipe', 'pipe', 'pipe'] // Capture stdin, stdout, and stderr
});

// Set up logging
const logFile = fs.createWriteStream('mcp-debug.log', { flags: 'w' });
const timestampedLog = (message) => {
  const timestamp = new Date().toISOString();
  logFile.write(`${timestamp} ${message}\n`);
  console.log(`${timestamp} ${message}`);
};

// Log process events
mcpProcess.on('error', (error) => {
  timestampedLog(`Process error: ${error.message}`);
});

mcpProcess.on('exit', (code, signal) => {
  timestampedLog(`Process exited with code ${code} and signal ${signal}`);
});

// Log stdout/stderr
mcpProcess.stdout.on('data', (data) => {
  timestampedLog(`STDOUT: ${data.toString().trim()}`);
});

mcpProcess.stderr.on('data', (data) => {
  timestampedLog(`STDERR: ${data.toString().trim()}`);
});

// Send initialize message to the MCP server
const sendMessage = (message) => {
  const messageStr = JSON.stringify(message);
  timestampedLog(`SENDING: ${messageStr}`);
  mcpProcess.stdin.write(messageStr + '\n');
};

// Wait for specified milliseconds
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test sequence
const runTest = async () => {
  // Initialize
  sendMessage({
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'debug-client', version: '0.1.0' }
    },
    jsonrpc: '2.0',
    id: 0
  });
  
  // Give the server time to initialize
  await wait(5000);
  
  // List tools
  sendMessage({
    method: 'tools/list',
    params: {},
    jsonrpc: '2.0',
    id: 1
  });
  
  // Wait and then send a simple tool call
  await wait(2000);
  sendMessage({
    method: 'tools/call',
    params: {
      name: 'get-address',
      arguments: {}
    },
    jsonrpc: '2.0',
    id: 2
  });
  
  // Let it run for 30 seconds total
  await wait(23000);
  timestampedLog('Test complete, stopping MCP process');
  mcpProcess.kill();
};

// Run the test
runTest().catch(error => {
  timestampedLog(`Test error: ${error.message}`);
  mcpProcess.kill();
});