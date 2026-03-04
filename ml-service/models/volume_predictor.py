import numpy as np
import pandas as pd
from typing import Optional
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import MinMaxScaler


class VolumePredictor:
    """
    Predicts next-day volume and delivery % using an ensemble of
    GradientBoosting (50%) + RandomForest (30%) + LinearRegression (20%).

    Trains on volume-specific features:
      - Volume moving averages (5, 10, 20 day)
      - Volume ratio (current / average)
      - Price-volume correlation
      - Day-of-week encoding
      - Delivery % history (when available from NSE)
    """

    WEIGHTS = {"gb": 0.5, "rf": 0.3, "lr": 0.2}

    def __init__(self):
        self.gb_vol = GradientBoostingRegressor(
            n_estimators=150, max_depth=4, learning_rate=0.05,
            subsample=0.8, random_state=42,
        )
        self.rf_vol = RandomForestRegressor(
            n_estimators=200, max_depth=6, min_samples_leaf=5,
            random_state=42, n_jobs=-1,
        )
        self.lr_vol = LinearRegression()

        self.gb_del = GradientBoostingRegressor(
            n_estimators=100, max_depth=3, learning_rate=0.05,
            random_state=42,
        )
        self.rf_del = RandomForestRegressor(
            n_estimators=150, max_depth=5, min_samples_leaf=5,
            random_state=42, n_jobs=-1,
        )
        self.lr_del = LinearRegression()

        self.vol_scaler = MinMaxScaler()
        self.is_trained = False
        self._has_delivery = False

    def _compute_features(
        self,
        prices: np.ndarray,
        volumes: np.ndarray,
        delivery: Optional[np.ndarray] = None,
    ) -> pd.DataFrame:
        """
        Build feature matrix for volume prediction.
        Returns DataFrame aligned to input arrays.
        """
        n = len(prices)
        df = pd.DataFrame({
            "price": prices,
            "volume": volumes,
        })

        # Volume SMAs and ratios
        df["vol_sma_5"] = df["volume"].rolling(5).mean()
        df["vol_sma_10"] = df["volume"].rolling(10).mean()
        df["vol_sma_20"] = df["volume"].rolling(20).mean()
        df["vol_ratio_5"] = df["volume"] / (df["vol_sma_5"] + 1e-10)
        df["vol_ratio_10"] = df["volume"] / (df["vol_sma_10"] + 1e-10)
        df["vol_ratio_20"] = df["volume"] / (df["vol_sma_20"] + 1e-10)

        # Volume volatility
        df["vol_std_10"] = df["volume"].rolling(10).std() / (df["vol_sma_10"] + 1e-10)

        # Price returns
        df["return_1d"] = df["price"].pct_change(1)
        df["return_5d"] = df["price"].pct_change(5)

        # Price volatility
        df["price_volatility_10"] = df["return_1d"].rolling(10).std()

        # RSI (14-period)
        delta = df["price"].diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.rolling(14).mean()
        avg_loss = loss.rolling(14).mean()
        rs = avg_gain / (avg_loss + 1e-10)
        df["rsi_14"] = 100 - (100 / (1 + rs))

        # Volume momentum (normalized as ratio to avoid overflow with large volumes)
        df["vol_momentum_5"] = (df["volume"] - df["volume"].shift(5)) / (df["vol_sma_10"] + 1e-10)
        df["vol_roc_5"] = df["volume"].pct_change(5)

        # Price-volume correlation (rolling 10-day)
        df["price_vol_corr"] = df["price"].rolling(10).corr(df["volume"])

        # Delivery features
        if delivery is not None and len(delivery) == n:
            df["delivery_pct"] = delivery
            df["delivery_sma_5"] = df["delivery_pct"].rolling(5).mean()
            df["delivery_vs_avg"] = df["delivery_pct"] / (df["delivery_sma_5"] + 1e-10) - 1
        else:
            df["delivery_pct"] = 50.0
            df["delivery_sma_5"] = 50.0
            df["delivery_vs_avg"] = 0.0

        # Target: next-day volume ratio (relative to 10-day SMA)
        df["vol_target"] = df["volume"].shift(-1) / (df["vol_sma_10"] + 1e-10)
        # Target: next-day delivery %
        if delivery is not None and len(delivery) == n:
            df["del_target"] = pd.Series(delivery).shift(-1)
        else:
            df["del_target"] = np.nan

        return df

    def _feature_cols(self) -> list[str]:
        return [
            "vol_ratio_5", "vol_ratio_10", "vol_ratio_20", "vol_std_10",
            "return_1d", "return_5d", "price_volatility_10",
            "rsi_14", "vol_momentum_5", "vol_roc_5", "price_vol_corr",
            "delivery_pct", "delivery_sma_5", "delivery_vs_avg",
        ]

    def train(
        self,
        prices: list[float],
        volumes: list[float],
        delivery_history: Optional[list[float]] = None,
    ):
        prices_arr = np.array(prices, dtype=float)
        volumes_arr = np.array(volumes, dtype=float)
        delivery_arr = np.array(delivery_history, dtype=float) if delivery_history and len(delivery_history) == len(prices) else None

        df = self._compute_features(prices_arr, volumes_arr, delivery_arr)
        cols = self._feature_cols()

        # Volume prediction training — fill NaN/inf in features to preserve more rows
        df[cols] = df[cols].replace([np.inf, -np.inf], 0.0).fillna(0.0)
        df_vol = df.dropna(subset=["vol_target"])
        if len(df_vol) < 10:
            raise ValueError(f"Insufficient clean data for volume prediction: {len(df_vol)} rows")

        X_vol = np.nan_to_num(df_vol[cols].values, nan=0.0)
        y_vol = df_vol["vol_target"].values

        self.vol_scaler.fit(volumes_arr.reshape(-1, 1))
        self.gb_vol.fit(X_vol, y_vol)
        self.rf_vol.fit(X_vol, y_vol)
        self.lr_vol.fit(X_vol, y_vol)

        # Delivery prediction training (if we have real delivery data)
        self._has_delivery = False
        if delivery_arr is not None:
            df_del = df.dropna(subset=["del_target"])
            if len(df_del) >= 10:
                X_del = np.nan_to_num(df_del[cols].values, nan=0.0)
                y_del = df_del["del_target"].values
                self.gb_del.fit(X_del, y_del)
                self.rf_del.fit(X_del, y_del)
                self.lr_del.fit(X_del, y_del)
                self._has_delivery = True

        self.is_trained = True

    def predict(
        self,
        prices: list[float],
        volumes: list[float],
        delivery_history: Optional[list[float]] = None,
        days: int = 5,
    ) -> dict:
        if not self.is_trained:
            raise ValueError("Model not trained. Call train() first.")

        prices_arr = np.array(prices, dtype=float)
        volumes_arr = np.array(volumes, dtype=float)
        delivery_arr = np.array(delivery_history, dtype=float) if delivery_history and len(delivery_history) == len(prices) else None

        current_prices = list(prices)
        current_volumes = list(volumes)
        current_delivery = list(delivery_history) if delivery_history else None

        vol_predictions = []
        del_predictions = []
        cols = self._feature_cols()

        latest_vol_sma10 = float(np.mean(volumes_arr[-10:]))

        for day in range(1, days + 1):
            p_arr = np.array(current_prices, dtype=float)
            v_arr = np.array(current_volumes, dtype=float)
            d_arr = np.array(current_delivery, dtype=float) if current_delivery else None

            df = self._compute_features(p_arr, v_arr, d_arr)
            last_row = np.nan_to_num(df[cols].iloc[-1:].values, nan=0.0)

            # Volume prediction (as ratio of SMA-10, then convert)
            gb_pred = float(self.gb_vol.predict(last_row)[0])
            rf_pred = float(self.rf_vol.predict(last_row)[0])
            lr_pred = float(self.lr_vol.predict(last_row)[0])
            vol_ratio = (
                self.WEIGHTS["gb"] * gb_pred
                + self.WEIGHTS["rf"] * rf_pred
                + self.WEIGHTS["lr"] * lr_pred
            )
            # Clamp ratio to reasonable range [0.5, 2.0] to prevent runaway predictions
            vol_ratio = max(0.5, min(2.0, vol_ratio))
            predicted_vol = int(latest_vol_sma10 * vol_ratio)
            # Cap day-over-day change to ±50% to prevent unrealistic jumps
            prev_vol = current_volumes[-1]
            max_vol = int(prev_vol * 1.5)
            min_vol = int(prev_vol * 0.5)
            predicted_vol = max(min_vol, min(max_vol, predicted_vol))
            change_pct = round((predicted_vol - prev_vol) / (prev_vol + 1e-10) * 100, 1)

            vol_predictions.append({
                "day": day,
                "volume": predicted_vol,
                "change_pct": change_pct,
            })

            # Delivery % prediction
            if self._has_delivery:
                gb_del = float(self.gb_del.predict(last_row)[0])
                rf_del = float(self.rf_del.predict(last_row)[0])
                lr_del = float(self.lr_del.predict(last_row)[0])
                pred_del = (
                    self.WEIGHTS["gb"] * gb_del
                    + self.WEIGHTS["rf"] * rf_del
                    + self.WEIGHTS["lr"] * lr_del
                )
                pred_del = max(15.0, min(90.0, pred_del))
            else:
                pred_del = 50.0

            del_predictions.append({
                "day": day,
                "delivery_pct": round(pred_del, 1),
            })

            # Update running arrays for autoregressive prediction
            current_volumes.append(predicted_vol)
            current_prices.append(current_prices[-1])  # Assume flat price for volume-only prediction
            if current_delivery is not None:
                current_delivery.append(pred_del)

            # Update rolling SMA-10 for next iteration
            latest_vol_sma10 = float(np.mean(current_volumes[-10:]))

        # Determine trends
        vol_changes = [v["change_pct"] for v in vol_predictions]
        avg_vol_change = np.mean(vol_changes)
        volume_trend = "increasing" if avg_vol_change > 5 else "decreasing" if avg_vol_change < -5 else "stable"

        if self._has_delivery and len(del_predictions) >= 2:
            del_values = [d["delivery_pct"] for d in del_predictions]
            del_slope = del_values[-1] - del_values[0]
            delivery_trend = "accumulation" if del_slope > 2 else "distribution" if del_slope < -2 else "neutral"
        else:
            delivery_trend = "neutral"

        # Confidence from model agreement
        df_last = self._compute_features(np.array(prices, dtype=float), np.array(volumes, dtype=float))
        last_features = np.nan_to_num(df_last[cols].iloc[-1:].values, nan=0.0)
        all_preds = [
            float(self.gb_vol.predict(last_features)[0]),
            float(self.rf_vol.predict(last_features)[0]),
            float(self.lr_vol.predict(last_features)[0]),
        ]
        disagreement = float(np.std(all_preds))
        confidence = round(max(0.2, min(0.95, 1.0 - disagreement)), 2)

        return {
            "volume_predictions": vol_predictions,
            "delivery_predictions": del_predictions,
            "volume_trend": volume_trend,
            "delivery_trend": delivery_trend,
            "confidence": confidence,
        }
