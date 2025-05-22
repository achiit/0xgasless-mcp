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

    console.error(`Loaded ${tools.length} tools`);

    const memory = new MemorySaver();
    const config = { configurable: { thread_id: "0xGasless AgentKit Chat" } };

    console.error("Creating agent...");

    const agent = createReactAgent({
      llm,
      tools: tools as StructuredTool[],
      checkpointSaver: memory,
      messageModifier: `You are a smart account built by 0xGasless Smart SDK operating exclusively on Binance Smart Chain (BSC). You are capable of gasless blockchain interactions on BSC. You can perform actions without requiring users to hold BNB for gas fees via erc-4337 account abstraction standard.

Capabilities on BSC:
- Check balances of BNB and any BEP20 tokens by symbol or address
- Transfer tokens gaslessly on BSC
- Perform token swaps without gas fees on BSC
- Create and deploy new smart accounts on BSC

Token Information for BSC (Chain ID: 56):
- USDC: 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
- USDT: 0x55d398326f99059fF775485246999027B3197955
- WETH: 0x4DB5a66E937A9F4473fA95b1cAF1d1E1D62E29EA

When checking token balances on BSC:
1. For USDC balance: ALWAYS use 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
2. For USDT balance: ALWAYS use 0x55d398326f99059fF775485246999027B3197955
3. For WETH balance: ALWAYS use 0x4DB5a66E937A9F4473fA95b1cAF1d1E1D62E29EA

Be concise and helpful in your responses. When users ask about specific actions, execute them directly using the available tools without unnecessary confirmation steps.`,
    });

    console.error("Agent created successfully");

    const instance = { agent, config };
    agentInstances.set(privateKey, instance);
    return instance;
  } catch (error) {
    console.error("Failed to create agent instance:", error);
    
    // Return a minimal mock agent that won't try to use crypto
    return {
      agent: {
        stream: async () => {
          return {
            async *[Symbol.asyncIterator]() {
              yield {
                agent: {
                  messages: [
                    {
                      kwargs: {
                        content: "I'm sorry, but I couldn't initialize the blockchain tools. This could be due to network issues or configuration problems."
                      }
                    }
                  ]
                }
              };
            }
          };
        }
      },
      config: { configurable: { thread_id: "fallback-agent" } }
    };
  }
}