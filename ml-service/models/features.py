import numpy as np
import pandas as pd
from typing import Optional


def compute_features(
    prices: list[float],
    fundamentals: Optional[dict] = None,
    sentiment: Optional[dict] = None,
    delivery_data: Optional[dict] = None,
    fiidii_data: Optional[dict] = None,
) -> pd.DataFrame:
    """
    Compute technical + fundamental + sentiment features from raw price series.
    Input: list of close prices (oldest first), optional fundamentals & sentiment.
    Output: DataFrame with features aligned to price series.
    """
    df = pd.DataFrame({"close": prices})

    # ── Price Returns ──
    df["return_1d"] = df["close"].pct_change(1)
    df["return_5d"] = df["close"].pct_change(5)
    df["return_10d"] = df["close"].pct_change(10)
    df["return_20d"] = df["close"].pct_change(20)

    # ── Moving Averages ──
    df["sma_5"] = df["close"].rolling(5).mean()
    df["sma_10"] = df["close"].rolling(10).mean()
    df["sma_20"] = df["close"].rolling(20).mean()
    df["sma_50"] = df["close"].rolling(50).mean()

    # ── Price relative to SMAs ──
    df["price_to_sma5"] = df["close"] / df["sma_5"] - 1
    df["price_to_sma20"] = df["close"] / df["sma_20"] - 1
    df["price_to_sma50"] = df["close"] / df["sma_50"] - 1

    # ── Volatility ──
    df["volatility_10d"] = df["return_1d"].rolling(10).std()
    df["volatility_20d"] = df["return_1d"].rolling(20).std()

    # ── RSI (14-period) ──
    delta = df["close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()
    rs = avg_gain / (avg_loss + 1e-10)
    df["rsi_14"] = 100 - (100 / (1 + rs))

    # ── MACD (12, 26, 9) ──
    ema_12 = df["close"].ewm(span=12, adjust=False).mean()
    ema_26 = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"] = ema_12 - ema_26
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_histogram"] = df["macd"] - df["macd_signal"]

    # ── Bollinger Bands ──
    df["bb_mid"] = df["close"].rolling(20).mean()
    bb_std = df["close"].rolling(20).std()
    df["bb_upper"] = df["bb_mid"] + 2 * bb_std
    df["bb_lower"] = df["bb_mid"] - 2 * bb_std
    df["bb_position"] = (df["close"] - df["bb_lower"]) / (df["bb_upper"] - df["bb_lower"] + 1e-10)

    # ── ATR (Average True Range, 14-period) ──
    high_low = df["close"].rolling(2).max() - df["close"].rolling(2).min()
    df["atr_14"] = high_low.rolling(14).mean()

    # ── Momentum ──
    df["momentum_5"] = df["close"] - df["close"].shift(5)
    df["momentum_10"] = df["close"] - df["close"].shift(10)
    df["momentum_20"] = df["close"] - df["close"].shift(20)

    # ── Rate of Change ──
    df["roc_5"] = df["close"].pct_change(5) * 100
    df["roc_10"] = df["close"].pct_change(10) * 100

    # ── Fundamental Features (constant across all rows) ──
    if fundamentals:
        df["pe_ratio"] = _safe_float(fundamentals.get("peRatio"))
        df["pb_ratio"] = _safe_float(fundamentals.get("priceToBook"))
        df["debt_to_equity"] = _safe_float(fundamentals.get("debtToEquity"))
        df["roe"] = _safe_float(fundamentals.get("roe"))
        df["profit_margin"] = _safe_float(fundamentals.get("profitMargin"))
        df["revenue_growth"] = _safe_float(fundamentals.get("revenueGrowth"))
        df["operating_margin"] = _safe_float(fundamentals.get("operatingMargin"))
        df["peg_ratio"] = _safe_float(fundamentals.get("pegRatio"))
    else:
        for col in _fundamental_columns():
            df[col] = 0.0

    # ── Sentiment Features (constant across all rows) ──
    if sentiment:
        df["sentiment_score"] = _safe_float(sentiment.get("score"), 0.0)
        df["sentiment_magnitude"] = _safe_float(sentiment.get("magnitude"), 0.5)
    else:
        df["sentiment_score"] = 0.0
        df["sentiment_magnitude"] = 0.5

    # ── Delivery Volume Feature (stock-specific, from NSE Bhavcopy) ──
    if delivery_data:
        df["delivery_pct"] = _safe_float(delivery_data.get("deliveryPercent"), 50.0)
        avg_del = _safe_float(delivery_data.get("avgDeliveryPercent"), 50.0)
        df["delivery_vs_avg"] = (df["delivery_pct"] / (avg_del if avg_del > 0 else 50.0)) - 1.0
    else:
        df["delivery_pct"] = 50.0
        df["delivery_vs_avg"] = 0.0

    # ── FII/DII Flow Features (market-wide regime signal) ──
    if fiidii_data:
        fii_net = _safe_float(fiidii_data.get("fiiNet"), 0.0)
        dii_net = _safe_float(fiidii_data.get("diiNet"), 0.0)
        df["fii_net_flow"] = fii_net
        df["dii_net_flow"] = dii_net
        df["institutional_net"] = fii_net + dii_net
    else:
        df["fii_net_flow"] = 0.0
        df["dii_net_flow"] = 0.0
        df["institutional_net"] = 0.0

    # ── Target: next day return ──
    df["target"] = df["close"].shift(-1) / df["close"] - 1

    return df


def _safe_float(val, default: float = 0.0) -> float:
    """Safely convert a value to float, returning default if None/invalid."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _fundamental_columns() -> list[str]:
    """Fundamental feature column names."""
    return [
        "pe_ratio", "pb_ratio", "debt_to_equity", "roe",
        "profit_margin", "revenue_growth", "operating_margin", "peg_ratio",
    ]


def get_feature_columns() -> list[str]:
    """Return the list of feature column names used for ML models."""
    return [
        # Technical (20)
        "return_1d", "return_5d", "return_10d", "return_20d",
        "price_to_sma5", "price_to_sma20", "price_to_sma50",
        "volatility_10d", "volatility_20d",
        "rsi_14", "macd", "macd_signal", "macd_histogram",
        "bb_position", "atr_14",
        "momentum_5", "momentum_10", "momentum_20",
        "roc_5", "roc_10",
        # Fundamentals (8)
        "pe_ratio", "pb_ratio", "debt_to_equity", "roe",
        "profit_margin", "revenue_growth", "operating_margin", "peg_ratio",
        # Sentiment (2)
        "sentiment_score", "sentiment_magnitude",
        # Delivery Volume (2)
        "delivery_pct", "delivery_vs_avg",
        # FII/DII Flows (3)
        "fii_net_flow", "dii_net_flow", "institutional_net",
    ]