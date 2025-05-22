import { Agentkit, AgentkitToolkit } from "@0xgasless/agentkit";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { StructuredTool } from '@langchain/core/tools';

// Cache for agent instances
const agentInstances = new Map();

export async function getOrCreateAgent(privateKey: `0x${string}`) {
  // Return cached instance if exists
  if (agentInstances.has(privateKey)) {
    console.error("Returning cached agent instance");
    return agentInstances.get(privateKey);
  }

  // Create new agent instance
  try {
    console.error("Creating new agent instance...");
    
    const llm = new ChatOpenAI({
      model: "openai/gpt-4o",
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
      temperature: 0, // Make responses more deterministic
    });

    console.error("OpenAI client created, configuring wallet...");

    // Configure agent with wallet
    const agentkit = await Agentkit.configureWithWallet({
      privateKey,
      rpcUrl: process.env.RPC_URL as string,
      apiKey: process.env.API_KEY as string,
      chainID: Number(process.env.CHAIN_ID) || 56,
    });

    console.error("Wallet configured, creating toolkit...");

    const toolkit = new AgentkitToolkit(agentkit);
    const tools = toolkit.getTools();

    console.error(`Loaded ${tools.length} tools:`, tools.map(t => t.name));

    const memory = new MemorySaver();
    const config = { configurable: { thread_id: "0xGasless AgentKit Chat" } };

    console.error("Creating agent...");

    const agent = createReactAgent({
      llm,
      tools: tools as StructuredTool[],
      checkpointSaver: memory,
      messageModifier: `You are a direct blockchain execution agent built by 0xGasless Smart SDK operating on Binance Smart Chain (BSC). Your job is to EXECUTE blockchain operations directly without asking questions or providing explanations unless there's an error.

CRITICAL INSTRUCTIONS:
- When asked to execute a blockchain operation, DO IT IMMEDIATELY using the available tools
- Do NOT ask for confirmation or clarification
- Do NOT provide explanations unless there's an error
- Return only the actual result of the operation
- Be direct and concise

Available Tools and Usage:
- get_wallet_address: Returns the wallet address directly
- get_balance: Checks token balance for given address (use 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d for USDC)
- transfer_token: Transfers tokens (execute the transfer immediately)
- swap_tokens: Swaps tokens (execute the swap immediately)

BSC Token Addresses:
- USDC: 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
- USDT: 0x55d398326f99059fF775485246999027B3197955
- WETH: 0x4DB5a66E937A9F4473fA95b1cAF1d1E1D62E29EA

When you receive a request:
1. Identify the required tool
2. Execute it immediately with the provided parameters
3. Return only the result

Do NOT engage in conversation. Execute operations directly.`,
    });

    console.error("Agent created successfully");

    const instance = { agent, config };
    agentInstances.set(privateKey, instance);
    return instance;
  } catch (error) {
    console.error("Failed to create agent instance:", error);
    throw error; // Don't return a mock agent, let the error bubble up
  }
}