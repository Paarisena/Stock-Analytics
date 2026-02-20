import numpy as np
from models.price_predictor import (
    LSTMPredictor,
    RandomForestPredictor,
    LinearRegressionPredictor,
)
from models.features import compute_features


class EnsemblePredictor:
    """
    Ensemble: LSTM-like 50% + Random Forest 30% + Linear Regression 20%
    """

    WEIGHTS = {"lstm": 0.5, "rf": 0.3, "lr": 0.2}

    def predict(
        self,
        symbol: str,
        historical_prices: list[float],
        current_price: float,
    ) -> dict:
        """
        Full prediction pipeline.
        Returns chart_data (real historical + ML predicted) + prediction summary.
        """
        prices = historical_prices

        # ── Train all models ──
        lstm = LSTMPredictor(lookback=min(60, len(prices) // 3))
        rf = RandomForestPredictor()
        lr = LinearRegressionPredictor()

        lstm.train(prices)
        rf.train(prices)
        lr.train(prices)

        # ── Predict 30 days ahead with each model ──
        days = 30
        lstm_preds = lstm.predict_days(prices, days)
        rf_preds = rf.predict_days(prices, days)
        lr_preds = lr.predict_days(prices, days)

        # ── Weighted ensemble ──
        ensemble_preds = []
        uppers = []
        lowers = []

        for i in range(days):
            weighted = (
                self.WEIGHTS["lstm"] * lstm_preds[i]
                + self.WEIGHTS["rf"] * rf_preds[i]
                + self.WEIGHTS["lr"] * lr_preds[i]
            )
            ensemble_preds.append(round(weighted, 2))

            # Confidence band from model disagreement
            all_three = [lstm_preds[i], rf_preds[i], lr_preds[i]]
            std = float(np.std(all_three))
            uppers.append(round(weighted + 1.5 * std, 2))
            lowers.append(round(weighted - 1.5 * std, 2))

        # ── Build chart_data ──
        chart_data = []

        # Last 30 days of REAL historical prices
        hist_slice = prices[-30:]
        for i, price in enumerate(hist_slice):
            chart_data.append({
                "day": i - len(hist_slice),
                "price": round(price, 2),
                "type": "historical",
            })

        # Current price (day 0)
        chart_data.append({
            "day": 0,
            "price": round(current_price, 2),
            "type": "current",
        })

        # ML predictions (day 1 to 30)
        for i in range(days):
            chart_data.append({
                "day": i + 1,
                "price": ensemble_preds[i],
                "upper": uppers[i],
                "lower": lowers[i],
                "type": "predicted",
            })

        # ── Technical signals from latest features ──
        df = compute_features(prices)
        last = df.iloc[-1]
        rsi = float(last.get("rsi_14", 50))
        macd_val = float(last.get("macd", 0))
        macd_sig = float(last.get("macd_signal", 0))

        rsi_signal = "Overbought" if rsi > 70 else "Oversold" if rsi < 30 else "Neutral"
        macd_trend = "Bullish" if macd_val > macd_sig else "Bearish"

        # ── Prediction summary ──
        predictions = {}
        for label, idx in [("next_1d", 0), ("next_5d", 4), ("next_10d", 9), ("next_30d", 29)]:
            if idx < len(ensemble_preds):
                pred_price = ensemble_preds[idx]
                change_pct = round((pred_price - current_price) / current_price * 100, 2)
                predictions[label] = {
                    "price": pred_price,
                    "change_pct": change_pct,
                    "confidence": [lowers[idx], uppers[idx]],
                }

        return {
            "symbol": symbol,
            "current_price": current_price,
            "chart_data": chart_data,
            "predictions": predictions,
            "model_weights": self.WEIGHTS,
            "model_predictions": {
                "lstm": [round(p, 2) for p in lstm_preds],
                "rf": [round(p, 2) for p in rf_preds],
                "lr": [round(p, 2) for p in lr_preds],
            },
            "technical_signals": {
                "rsi": round(rsi, 2),
                "rsi_signal": rsi_signal,
                "macd_trend": macd_trend,
                "macd_value": round(macd_val, 4),
                "macd_signal": round(macd_sig, 4),
            },
        }

    def predict_intraday(
        self,
        symbol: str,
        recent_prices: list[float],
        interval_seconds: int = 60,
    ) -> dict:
        """
        Lightweight intraday prediction from recent price ticks.
        Uses simple momentum + linear regression for speed.
        """
        prices = np.array(recent_prices)
        n = len(prices)

        # Linear trend
        x = np.arange(n).reshape(-1, 1)
        lr = LinearRegressionPredictor()
        lr.model.fit(x, prices)

        # Momentum
        momentum = float(prices[-1] - prices[-5]) if n >= 5 else 0.0
        avg_change = float(np.diff(prices[-20:]).mean()) if n >= 20 else float(np.diff(prices).mean())
        volatility = float(np.std(np.diff(prices[-20:]))) if n >= 20 else float(np.std(np.diff(prices)))

        # Predict intervals ahead
        predictions = {}
        for label, ticks in [("5min", 5), ("15min", 15), ("30min", 30)]:
            steps = max(1, ticks * 60 // interval_seconds)
            future_x = np.array([[n + steps]])
            trend_pred = float(lr.model.predict(future_x)[0])
            momentum_adj = momentum * (steps / 5)
            pred = trend_pred + momentum_adj * 0.3
            upper = pred + 1.5 * volatility * np.sqrt(steps)
            lower = pred - 1.5 * volatility * np.sqrt(steps)

            direction = "up" if pred > prices[-1] else "down"
            change_pct = round((pred - prices[-1]) / prices[-1] * 100, 3)

            predictions[label] = {
                "price": round(pred, 2),
                "upper": round(upper, 2),
                "lower": round(lower, 2),
                "direction": direction,
                "change_pct": change_pct,
            }

        return {
            "symbol": symbol,
            "current_price": round(float(prices[-1]), 2),
            "predictions": predictions,
            "momentum": round(momentum, 4),
            "volatility": round(volatility, 4),
            "trend": "up" if avg_change > 0 else "down",
        }