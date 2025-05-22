const { spawn } = require('child_process');
const path = require('path');

// Path to your MCP server
const mcpPath = path.join(__dirname, 'build', 'index.js');

// Spawn the MCP server
const mcpProcess = spawn('node', [mcpPath], {
  stdio: ['pipe', 'pipe', 'inherit'] // Capture stdin/stdout but pass stderr through
});

// Send an initialize message
const initMessage = {
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.1.0' }
  },
  jsonrpc: '2.0',
  id: 0
};

console.log('Sending initialize message...');
mcpProcess.stdin.write(JSON.stringify(initMessage) + '\n');

// Send a tools/list message after a delay
setTimeout(() => {
  const toolsListMessage = {
    method: 'tools/list',
    params: {},
    jsonrpc: '2.0',
    id: 1
  };
  console.log('Sending tools/list message...');
  mcpProcess.stdin.write(JSON.stringify(toolsListMessage) + '\n');
}, 2000);

// Handle MCP server response
let dataBuffer = '';
mcpProcess.stdout.on('data', (data) => {
  dataBuffer += data.toString();
  
  // Try to parse complete JSON messages
  try {
    const lines = dataBuffer.split('\n');
    dataBuffer = lines.pop(); // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.trim()) {
        const message = JSON.parse(line.trim());
        console.log('\nReceived message:');
        console.log(JSON.stringify(message, null, 2));
      }
    }
  } catch (error) {
    console.log('Received incomplete or invalid JSON:', data.toString());
  }
});

// Close the process after 10 seconds
setTimeout(() => {
  console.log('Test complete, closing...');
  mcpProcess.kill();
  process.exit(0);
}, 10000);