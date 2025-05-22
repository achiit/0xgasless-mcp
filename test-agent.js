// test-agent.js
const dotenv = require('dotenv');
dotenv.config();

// Import the compiled agent module
const { getOrCreateAgent } = require('./build/lib/agent.js');

async function main() {
  try {
    console.log('Testing agent with wallet initialization...');
    
    // Get privateKey from environment
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error('ERROR: PRIVATE_KEY not set in environment');
      process.exit(1);
    }
    
    console.log('Initializing agent...');
    const { agent, config } = await getOrCreateAgent(privateKey);
    console.log('Agent initialized successfully');
    
    // Process the stream manually with detailed logging
    console.log('\nTesting tool: get-address');
    const prompt = "Use the get-address tool with these arguments: {}";
    console.log(`Sending prompt: ${prompt}`);
    
    const stream = await agent.stream({ input: prompt }, config);
    
    console.log('Stream created, processing chunks:');
    
    // Process all chunks and logs
    let chunkIndex = 0;
    for await (const chunk of stream) {
      chunkIndex++;
      console.log(`\nChunk ${chunkIndex}:`);
      console.log(JSON.stringify(chunk, null, 2));
      
      // Process agent messages
      if (chunk.agent?.messages) {
        console.log(`Found ${chunk.agent.messages.length} agent message(s)`);
        chunk.agent.messages.forEach((msg, i) => {
          console.log(`Message ${i + 1}:`);
          if (msg.kwargs?.content) {
            console.log(`Content: ${msg.kwargs.content}`);
          }
          
          // Check for tool calls
          if (msg.kwargs?.tool_calls) {
            console.log(`Tool calls: ${JSON.stringify(msg.kwargs.tool_calls)}`);
          }
        });
      }
      
      // Process tool responses
      if (chunk.tools?.messages) {
        console.log(`Found ${chunk.tools.messages.length} tool message(s)`);
        chunk.tools.messages.forEach((msg, i) => {
          console.log(`Tool message ${i + 1}:`);
          if (msg.kwargs?.content) {
            console.log(`Content: ${msg.kwargs.content}`);
          }
        });
      }
    }
    
    console.log('\nTest completed');
  } catch (error) {
    console.error('Error in test:', error);
  }
}

main().catch(console.error);