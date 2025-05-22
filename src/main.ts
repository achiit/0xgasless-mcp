import { Agentkit, getAllAgentkitActions } from "@0xgasless/agentkit";
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';
import { version } from './version.js';
import { Writable } from 'stream';
import { encodeFunctionData, formatUnits, parseUnits } from 'viem';

// Load environment variables
dotenv.config();

// OpenRouter types
type OpenRouterTransferIntentResponse = {
  data: {
    id: string;
    created_at: string;
    expires_at: string;
    web3_data: {
      transfer_intent: {
        metadata: {
          chain_id: number;
          contract_address: string;
          sender: string;
        };
        call_data: {
          recipient_amount: string;
          deadline: string;
          recipient: string;
          recipient_currency: string;
          refund_destination: string;
          fee_amount: string;
          id: string;
          operator: string;
          signature: string;
          prefix: string;
        };
      };
    };
  };
};

// ERC20 ABI for token operations
const ERC20_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// USDC addresses for different chains
const USDC_ADDRESSES: Record<number, string> = {
  56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // BSC
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum
  137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon
};

const USDC_DECIMALS = 6;

// Global state for agentkit
let agentkitInstance: Agentkit | null = null;
let agentkitActions: any[] = [];
let toolsInitialized = false;

// Create a null stream to suppress stdout during operations
const nullStream = new Writable({
  write(chunk, encoding, callback) {
    callback();
  }
});

// Function to suppress stdout during execution
function withSuppressedStdout<T>(fn: () => Promise<T>): Promise<T> {
  const originalStdout = process.stdout.write;
  const originalConsoleLog = console.log;
  
  process.stdout.write = nullStream.write.bind(nullStream);
  console.log = () => {};
  
  return fn().finally(() => {
    process.stdout.write = originalStdout;
    console.log = originalConsoleLog;
  });
}

// Initialize agentkit and get actions
async function initializeAgentkit() {
  if (toolsInitialized && agentkitInstance) {
    return { agentkit: agentkitInstance, actions: agentkitActions };
  }

  try {
    console.error("🚀 Initializing 0xGasless Agentkit...");
    
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    const rpcUrl = process.env.RPC_URL as string;
    const apiKey = process.env.API_KEY as string;
    const chainID = Number(process.env.CHAIN_ID) || 56;

    console.error(`📋 Config: Chain ${chainID}`);

    const agentkit = await withSuppressedStdout(async () => {
      return await Agentkit.configureWithWallet({
        privateKey,
        rpcUrl,
        apiKey,
        chainID,
      });
    });

    console.error("✅ Agentkit configured successfully");

    const actions = getAllAgentkitActions();
    console.error(`📦 Found ${actions.length} agentkit actions`);

    agentkitInstance = agentkit;
    agentkitActions = actions;
    toolsInitialized = true;

    return { agentkit, actions };
  } catch (error) {
    console.error("❌ Failed to initialize Agentkit:", error);
    throw error;
  }
}

// Tool name mapping between MCP and AgentKit
const MCP_TO_AGENTKIT_MAPPING: Record<string, string> = {
  'get-address': 'get_address',
  'get-balance': 'get_balance', 
  'transfer-token': 'smart_transfer',
  'swap-tokens': 'smart_swap',
  'buy-openrouter-credits': 'custom_openrouter', // Custom implementation
};

// Convert MCP arguments to AgentKit arguments
function convertMcpArgsToAgentkitArgs(mcpToolName: string, mcpArgs: any): any {
  switch (mcpToolName) {
    case 'get-address':
      return {}; // get_address takes no arguments

    case 'get-balance':
      // Looking at the 0xGasless source, get_balance accepts tokenAddresses or tokenSymbols
      if (mcpArgs.address === '0x0000000000000000000000000000000000000000') {
        // For native token, return empty to get all balances
        return {};
      } else if (mcpArgs.address) {
        // For specific token address, use tokenAddresses array
        return {
          tokenAddresses: [mcpArgs.address]
        };
      }
      return {}; // Default: get all balances

    case 'transfer-token':
      // smart_transfer expects: amount, tokenAddress, destination
      return {
        amount: mcpArgs.amount,
        tokenAddress: mcpArgs.address === '0x0000000000000000000000000000000000000000' ? 'eth' : mcpArgs.address,
        destination: mcpArgs.to
      };

    case 'swap-tokens':
      // smart_swap expects: tokenIn, tokenOut, amount
      return {
        tokenIn: mcpArgs.fromToken,
        tokenOut: mcpArgs.toToken,
        amount: mcpArgs.amount
      };

    case 'buy-openrouter-credits':
      return {
        amountUsd: mcpArgs.amountUsd
      };

    default:
      return mcpArgs;
  }
}

// Custom OpenRouter credits purchase function
async function buyOpenRouterCredits(agentkit: Agentkit, args: { amountUsd: number }): Promise<string> {
  try {
    const { amountUsd } = args;

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not set in environment variables');
    }

    const chainId = await agentkit.getChainId();
    const address = await agentkit.getAddress();
    
    // Get USDC address for current chain
    const usdcAddress = USDC_ADDRESSES[chainId];
    if (!usdcAddress) {
      throw new Error(`USDC not supported on chain ${chainId}. Supported chains: Base (8453), BSC (56), Ethereum (1), Polygon (137)`);
    }

    console.error(`💳 Buying $${amountUsd} OpenRouter credits on chain ${chainId}`);

    // Check USDC balance first
    const balanceAction = agentkitActions.find(a => a.name === 'get_balance');
    if (balanceAction) {
      try {
        const balanceResult = await agentkit.run(balanceAction as any, { tokenAddresses: [usdcAddress] } as any);
        console.error(`Current balance check: ${balanceResult}`);
      } catch (balanceError) {
        console.error(`Balance check failed: ${balanceError}`);
      }
    }

    // Create OpenRouter transfer intent
    const response = await fetch('https://openrouter.ai/api/v1/credits/coinbase', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountUsd,
        sender: address,
        chain_id: chainId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const responseJSON: OpenRouterTransferIntentResponse = await response.json();
    
    const {
      data: {
        web3_data: {
          transfer_intent: { call_data },
        },
      },
    } = responseJSON;

    // Calculate total amount needed (recipient + fee)
    const atomicUnits = BigInt(call_data.recipient_amount) + BigInt(call_data.fee_amount);
    
    console.error(`💰 Total amount needed: ${formatUnits(atomicUnits, USDC_DECIMALS)} USDC`);

    // Step 1: Approve USDC spending
    const transferAction = agentkitActions.find(a => a.name === 'smart_transfer');
    if (!transferAction) {
      throw new Error('Transfer action not found');
    }

    // First, we need to approve the contract to spend USDC
    // We'll use a direct contract call for approval
    
    // For now, let's create a simplified version that uses the existing transfer action
    // In a production environment, you'd want to implement the full Coinbase Commerce integration
    
    const approvalAmount = formatUnits(atomicUnits, USDC_DECIMALS);
    
    return `OpenRouter Credits Purchase Initiated:
📊 Amount: $${amountUsd} USD
💰 USDC Required: ${approvalAmount} USDC
🔗 Chain: ${chainId}
📝 Transaction ID: ${responseJSON.data.id}

⚠️ Note: Full integration requires implementing Coinbase Commerce contract calls.
For now, you can manually approve and execute the transaction using the provided details.

Contract Address: ${responseJSON.data.web3_data.transfer_intent.metadata.contract_address}
Recipient Amount: ${call_data.recipient_amount}
Fee Amount: ${call_data.fee_amount}
Deadline: ${call_data.deadline}`;

  } catch (error) {
    console.error('OpenRouter credits purchase error:', error);
    return `Error buying OpenRouter credits: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Convert agentkit actions to MCP tools format
function convertToMcpTools(): Tool[] {
  return [
    {
      name: 'get-address',
      description: 'Gets the smart account wallet address',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
    },
    {
      name: 'get-balance',
      description: 'Gets the balance of tokens in the smart account',
      inputSchema: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Token contract address (use "0x0000000000000000000000000000000000000000" for native token like BNB/ETH)',
          },
        },
        required: [],
      },
    },
    {
      name: 'transfer-token',
      description: 'Transfer tokens gaslessly to another address',
      inputSchema: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Recipient address',
          },
          address: {
            type: 'string',
            description: 'Token contract address (use "0x0000000000000000000000000000000000000000" for native token)',
          },
          amount: {
            type: 'string',
            description: 'Amount to transfer',
          },
        },
        required: ['to', 'address', 'amount'],
      },
    },
    {
      name: 'swap-tokens',
      description: 'Swap one token for another gaslessly',
      inputSchema: {
        type: 'object',
        properties: {
          fromToken: {
            type: 'string',
            description: 'Source token address',
          },
          toToken: {
            type: 'string',
            description: 'Destination token address',
          },
          amount: {
            type: 'string',
            description: 'Amount to swap',
          },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
    {
      name: 'buy-openrouter-credits',
      description: 'Buy OpenRouter AI credits with USDC',
      inputSchema: {
        type: 'object',
        properties: {
          amountUsd: {
            type: 'number',
            description: 'The amount of credits to buy in USD (e.g., 10 for $10)',
            minimum: 1,
            maximum: 1000
          },
        },
        required: ['amountUsd'],
      },
    },
  ];
}

// Execute agentkit actions directly
async function executeAgentkitAction(toolName: string, args: any): Promise<string> {
  try {
    const { agentkit, actions } = await initializeAgentkit();
    
    // Handle custom OpenRouter integration
    if (toolName === 'buy-openrouter-credits') {
      return await withSuppressedStdout(async () => {
        return await buyOpenRouterCredits(agentkit, args);
      });
    }
    
    // Get the correct action name
    const agentkitActionName = MCP_TO_AGENTKIT_MAPPING[toolName];
    if (!agentkitActionName) {
      throw new Error(`No mapping found for MCP tool: ${toolName}`);
    }

    // Find the action in the available actions
    const action = actions.find((a: any) => a.name === agentkitActionName);
    if (!action) {
      throw new Error(`Action ${agentkitActionName} not found in available actions`);
    }

    // Convert MCP arguments to AgentKit arguments
    const actionArgs = convertMcpArgsToAgentkitArgs(toolName, args);

    // Execute the action with suppressed stdout
    // Cast to any to avoid TypeScript schema validation issues
    const result = await withSuppressedStdout(async () => {
      return await agentkit.run(action as any, actionArgs as any);
    });
    
    return result;

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('insufficient funds')) {
        return `Error: Insufficient funds for ${toolName}. Please ensure you have enough balance.`;
      }
      if (error.message.includes('invalid address')) {
        return `Error: Invalid address provided for ${toolName}. Please check the address format.`;
      }
      if (error.message.includes('Smart Account is required')) {
        return `Error: Smart account configuration issue. Please check your environment variables.`;
      }
      return `Error executing ${toolName}: ${error.message}`;
    }
    
    return `Error executing ${toolName}: ${String(error)}`;
  }
}

// Validation function
function validateEnvironment(): boolean {
  const required = ['PRIVATE_KEY', 'RPC_URL', 'API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    return false;
  }
  
  const privateKey = process.env.PRIVATE_KEY;
  if (privateKey && !privateKey.startsWith('0x')) {
    console.error('❌ PRIVATE_KEY should start with 0x');
    return false;
  }
  
  console.error('✅ Environment variables validated');
  return true;
}

// Log server info
function logServerInfo() {
  console.error('\n=== 0xGasless MCP SERVER ===');
  console.error(`Chain ID: ${process.env.CHAIN_ID || '56 (default)'}`);
  console.error(`Private Key: ${process.env.PRIVATE_KEY ? '[SET]' : '[NOT SET]'}`);
  console.error(`API Key: ${process.env.API_KEY ? '[SET]' : '[NOT SET]'}`);
  console.error(`OpenRouter API Key: ${process.env.OPENROUTER_API_KEY ? '[SET]' : '[NOT SET]'}`);
  console.error('============================\n');
}

export async function main() {
  logServerInfo();
  
  if (!validateEnvironment()) {
    process.exit(1);
  }

  try {
    await initializeAgentkit();
    console.error("✅ 0xGasless Agentkit initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize Agentkit:", error);
    process.exit(1);
  }

  const server = new Server(
    {
      name: '0xGasless MCP Server with OpenRouter',
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const mcpTools = convertToMcpTools();
    return { tools: mcpTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      const result = await executeAgentkitAction(name, args || {});
      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  console.error('🔌 Starting MCP server with OpenRouter integration...');
  await server.connect(transport);
  console.error('✅ 0xGasless MCP Server running with OpenRouter support');
}