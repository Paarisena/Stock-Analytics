from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from models.ensemble import EnsemblePredictor
from models.cache import ModelCache
import time

# Instances
ensemble = EnsemblePredictor()
cache = ModelCache()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("ML Service starting...")
    yield
    print("ML Service shutting down...")
    cache.clear()


app = FastAPI(
    title="Stock ML Prediction Service",
    description="LSTM + Random Forest + Linear Regression ensemble for stock price prediction",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request/Response Models ──

class PricePredictionRequest(BaseModel):
    symbol: str
    historical_prices: list[float]
    current_price: float

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "symbol": "RELIANCE.NS",
                "historical_prices": [1200.0] * 200,
                "current_price": 1280.0,
            }]
        }
    }


class IntradayPredictionRequest(BaseModel):
    symbol: str
    recent_prices: list[float]
    interval_seconds: int = 60


# ── Endpoints ──

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "models": ["lstm", "random_forest", "linear_regression"],
        "cache_size": cache.size(),
    }


@app.post("/predict/price")
async def predict_price(request: PricePredictionRequest):
    """
    Main prediction endpoint.
    Takes 200-day historical prices from Yahoo Finance.
    Returns real historical chart data + ML predictions with confidence bands.
    """
    if len(request.historical_prices) < 30:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 30 historical prices, got {len(request.historical_prices)}",
        )

    start_time = time.time()

    # Check cache
    cached = cache.get(request.symbol)
    if cached:
        cached["cached"] = True
        cached["training_time_ms"] = 0
        return cached

    try:
        result = ensemble.predict(
            symbol=request.symbol,
            historical_prices=request.historical_prices,
            current_price=request.current_price,
        )

        training_time = int((time.time() - start_time) * 1000)
        result["training_time_ms"] = training_time
        result["cached"] = False

        # Cache for 24 hours
        cache.set(request.symbol, result)

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.post("/predict/intraday")
async def predict_intraday(request: IntradayPredictionRequest):
    """
    Lightweight intraday prediction.
    Takes recent price ticks, predicts next 5/15/30 minutes.
    """
    if len(request.recent_prices) < 10:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 10 recent prices, got {len(request.recent_prices)}",
        )

    try:
        result = ensemble.predict_intraday(
            symbol=request.symbol,
            recent_prices=request.recent_prices,
            interval_seconds=request.interval_seconds,
        )
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Intraday prediction failed: {str(e)}")