import numpy as np
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import MinMaxScaler
from models.features import compute_features, get_feature_columns


class LSTMPredictor:
    """
    LSTM-like predictor using scikit-learn (no PyTorch needed).
    Uses sliding window approach with Gradient Boosting to mimic
    sequential pattern learning.
    """

    def __init__(self, lookback: int = 60):
        self.lookback = lookback
        self.model = GradientBoostingRegressor(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            random_state=42,
        )
        self.scaler = MinMaxScaler()
        self.is_trained = False

    def train(self, prices: list[float]):
        """Train on sliding windows of price data."""
        data = np.array(prices).reshape(-1, 1)
        scaled = self.scaler.fit_transform(data).flatten()

        X, y = [], []
        for i in range(self.lookback, len(scaled)):
            window = scaled[i - self.lookback: i]
            # Features from the window: recent values + statistics
            features = self._window_features(window)
            X.append(features)
            y.append(scaled[i])

        X = np.array(X)
        y = np.array(y)

        self.model.fit(X, y)
        self.is_trained = True

    def predict_days(self, prices: list[float], days: int = 30) -> list[float]:
        """Predict future prices autoregressively."""
        if not self.is_trained:
            raise ValueError("Model not trained. Call train() first.")

        data = np.array(prices).reshape(-1, 1)
        scaled = self.scaler.transform(data).flatten()
        window = list(scaled[-self.lookback:])

        predictions = []
        for _ in range(days):
            features = self._window_features(np.array(window[-self.lookback:]))
            pred_scaled = self.model.predict(features.reshape(1, -1))[0]
            # Clamp to prevent runaway predictions
            pred_scaled = np.clip(pred_scaled, scaled[-1] * 0.8, scaled[-1] * 1.2)
            window.append(pred_scaled)
            pred_price = self.scaler.inverse_transform([[pred_scaled]])[0][0]
            predictions.append(float(pred_price))

        return predictions

    def _window_features(self, window: np.ndarray) -> np.ndarray:
        """Extract features from a price window."""
        return np.array([
            window[-1],                          # last price
            window[-5:].mean(),                  # 5-day avg
            window[-10:].mean(),                 # 10-day avg
            window[-20:].mean() if len(window) >= 20 else window.mean(),  # 20-day avg
            window.std(),                        # full window volatility
            window[-5:].std(),                   # recent volatility
            window[-1] - window[-5],             # 5-day momentum
            window[-1] - window[-10],            # 10-day momentum
            window[-1] - window[0],              # full window trend
            (window[-1] - window.min()) / (window.max() - window.min() + 1e-10),  # position in range
            np.diff(window[-10:]).mean(),         # avg daily change (recent)
            np.diff(window).mean(),               # avg daily change (full)
        ])


class RandomForestPredictor:
    """Feature-based prediction using engineered technical indicators."""

    def __init__(self):
        self.model = RandomForestRegressor(
            n_estimators=300,
            max_depth=8,
            min_samples_leaf=5,
            random_state=42,
            n_jobs=-1,
        )
        self.is_trained = False

    def train(self, prices: list[float]):
        """Train on technical features."""
        df = compute_features(prices)
        feature_cols = get_feature_columns()

        # Drop rows with NaN (from rolling calculations)
        df_clean = df.dropna(subset=feature_cols + ["target"])

        X = df_clean[feature_cols].values
        y = df_clean["target"].values

        self.model.fit(X, y)
        self.is_trained = True

    def predict_days(self, prices: list[float], days: int = 30) -> list[float]:
        """Predict iteratively: predict next day return → update prices → repeat."""
        if not self.is_trained:
            raise ValueError("Model not trained.")

        current_prices = list(prices)
        predictions = []

        for _ in range(days):
            df = compute_features(current_prices)
            feature_cols = get_feature_columns()
            last_row = df[feature_cols].iloc[-1:].values

            # Handle NaN in features
            last_row = np.nan_to_num(last_row, nan=0.0)

            predicted_return = self.model.predict(last_row)[0]
            # Clamp return to prevent extreme predictions
            predicted_return = np.clip(predicted_return, -0.05, 0.05)
            next_price = current_prices[-1] * (1 + predicted_return)
            predictions.append(float(next_price))
            current_prices.append(next_price)

        return predictions


class LinearRegressionPredictor:
    """Simple trend-based baseline model."""

    def __init__(self):
        self.model = LinearRegression()
        self.is_trained = False

    def train(self, prices: list[float]):
        """Train on technical features."""
        df = compute_features(prices)
        feature_cols = get_feature_columns()
        df_clean = df.dropna(subset=feature_cols + ["target"])

        X = df_clean[feature_cols].values
        y = df_clean["target"].values

        self.model.fit(X, y)
        self.is_trained = True

    def predict_days(self, prices: list[float], days: int = 30) -> list[float]:
        """Predict iteratively."""
        if not self.is_trained:
            raise ValueError("Model not trained.")

        current_prices = list(prices)
        predictions = []

        for _ in range(days):
            df = compute_features(current_prices)
            feature_cols = get_feature_columns()
            last_row = df[feature_cols].iloc[-1:].values
            last_row = np.nan_to_num(last_row, nan=0.0)

            predicted_return = self.model.predict(last_row)[0]
            predicted_return = np.clip(predicted_return, -0.05, 0.05)
            next_price = current_prices[-1] * (1 + predicted_return)
            predictions.append(float(next_price))
            current_prices.append(next_price)

        return predictions