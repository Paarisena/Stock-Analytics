import numpy as np
import pandas as pd


def compute_features(prices: list[float]) -> pd.DataFrame:
    """
    Compute technical features from raw price series.
    Input: list of close prices (oldest first).
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

    # ── Target: next day return ──
    df["target"] = df["close"].shift(-1) / df["close"] - 1

    return df


def get_feature_columns() -> list[str]:
    """Return the list of feature column names used for ML models."""
    return [
        "return_1d", "return_5d", "return_10d", "return_20d",
        "price_to_sma5", "price_to_sma20", "price_to_sma50",
        "volatility_10d", "volatility_20d",
        "rsi_14", "macd", "macd_signal", "macd_histogram",
        "bb_position", "atr_14",
        "momentum_5", "momentum_10", "momentum_20",
        "roc_5", "roc_10",
    ]