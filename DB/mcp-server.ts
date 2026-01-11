import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema,ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";



const server = new Server (
    {
        name: "Stock_Weather",
        version: "0.1.0",

    },
    {
        capabilities:{
            tools:{}
        }
    }
)

server.setRequestHandler(ListToolsRequestSchema, async()=>{
    return{
        tools:[
            {
                name: 'get_stock_price',
                description: 'Get real-time stock price data for a given symbol',
                inputSchema: {
                    type: 'object',
                    properties: {
                        symbol: {
                            type: 'string',
                            description: 'Stock ticker symbol (e.g., AAPL, TSLA, RELIANCE.NS)',
                        },
                        exchange: {
                            type: 'string',
                            description: 'Exchange suffix (optional, e.g., .NS for NSE, .TO for Tokyo)',
                            default: '',
                        },
                    },
                    required: ['symbol'],
                },
            },
        ]
    }
});
server.setRequestHandler(CallToolRequestSchema, async(request)=>{
    const {name, arguments: args} = request.params;
    if(name === 'get_stock_price'){
        const {symbol, exchange} = args as {symbol:string, exchange?:string};

        try {
            const ticker = `${symbol}${exchange || ''}`;
            const response = await fetch(
                `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`
            );
            const data = await response.json();
            
            const quote = data.chart.result[0];
            const meta = quote.meta;
            const indicators = quote.indicators.quote[0];
            
            // Calculate change and change percent
            const currentPrice = meta.regularMarketPrice;
            const previousClose = meta.previousClose || meta.chartPreviousClose;
            const change = currentPrice - previousClose;
            const changePercent = (change / previousClose) * 100;
            
            // Get OHLC data
            const open = indicators.open?.[0] || meta.regularMarketOpen;
            const close = indicators.close?.[0] || meta.regularMarketClose;
            const high = meta.regularMarketDayHigh || Math.max(...indicators.high.filter((h: number) => h !== null));
            const low = meta.regularMarketDayLow || Math.min(...indicators.low.filter((l: number) => l !== null));
            const volume = indicators.volume[indicators.volume.length - 1];
            
            // Return structured data as JSON
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            symbol: meta.symbol,
                            name: meta.longName || meta.shortName || symbol,
                            price: currentPrice,
                            change: change,
                            changePercent: changePercent,
                            high: high,
                            low: low,
                            open: open,
                            close: close,
                            previousClose: previousClose,
                            volume: volume,
                            currency: meta.currency || 'USD',
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error fetching stock price: ${error}`
                    }
                ],
                isError: true
            };
        }
    }
    
    throw new Error(`Unknown tool: ${name}`);
});