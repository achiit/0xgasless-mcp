# 0xGasless MCP Server

A Model Context Protocol (MCP) server that enables gasless blockchain operations through AI assistants like Claude Desktop.

## Overview

The 0xGasless MCP Server bridges AI assistants with blockchain functionality, allowing users to perform gasless transactions, check balances, and swap tokens directly through conversational interfaces. 

## Features

- **Gasless Transactions**: Transfer tokens without paying gas fees
- **Token Swapping**: Swap tokens gaslessly using integrated DEX protocols  
- **Balance Checking**: Query token balances across your smart account
- **Address Management**: Get your smart account wallet address
- **MCP Integration**: Works seamlessly with Claude Desktop and other MCP clients

## Architecture

The server implements a translation layer between MCP clients and the 0xGasless Agentkit:

```
MCP Client (Claude) → MCP Server → 0xGasless Agentkit → Binance Smart Chain
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/achiit/0xgasless-mcp.git
cd 0xgasless-mcp
```

2. Install dependencies:
```bash
npm install

or

bun install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

## Configuration

Set the following environment variables in your `.env` file: [3](#0-2) 

```env
PRIVATE_KEY=0x...          # Your wallet private key (must start with 0x)
RPC_URL=https://...        # Binance Smart Chain RPC endpoint
API_KEY=...                # 0xGasless API key
CHAIN_ID=56                # Chain ID (56 for BSC mainnet, optional)
```

## Available Tools

The server exposes four main tools to MCP clients: 

### `get-address`
Gets your smart account wallet address.

### `get-balance` 
Checks token balances in your smart account.
- `address` (optional): Token contract address (use `0x0000000000000000000000000000000000000000` for native BNB)

### `transfer-token`
Transfers tokens gaslessly to another address.
- `to`: Recipient address
- `address`: Token contract address  
- `amount`: Amount to transfer

### `swap-tokens`
Swaps one token for another gaslessly.
- `fromToken`: Source token address
- `toToken`: Destination token address
- `amount`: Amount to swap

## Usage

### With Claude Desktop

Add the server to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "0xgasless": {
      "command": "node",
      "args": ["path/to/0xgasless-mcp/build/index.js"],
      "env": {
        "PRIVATE_KEY": "0x...",
        "RPC_URL": "https://...",
        "API_KEY": "..."
      }
    }
  }
}
```

### Standalone

Run the server directly:

```bash
npm start

or

bun start
```

## Development

Build the project:
```bash
npm run build

or

bun run build
```

The server initializes the 0xGasless Agentkit and validates the environment on startup: [6](#0-5) 

## Error Handling

The server provides comprehensive error handling for common scenarios: [7](#0-6) 

- Insufficient funds
- Invalid addresses  
- Smart account configuration issues
- Missing environment variables


## Notes

The server uses a mapping system to translate between MCP tool names and Agentkit action names, ensuring seamless integration between the two systems. The `src/lib/agent.ts` file is deprecated as the main server now directly integrates with the 0xGasless Agentkit. [8](#0-7) 

Detailed documentation :
- [Core Architecture (achiit/0xgasless-mcp)](/wiki/achiit/0xgasless-mcp#2)