import numpy as np
from typing import Optional
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
            pred_scaled = np.clip(pred_scaled, scaled[-1] * 0.8, scaled[-1] * 1.2)
            window.append(pred_scaled)
            pred_price = self.scaler.inverse_transform([[pred_scaled]])[0][0]
            predictions.append(float(pred_price))

        return predictions

    def _window_features(self, window: np.ndarray) -> np.ndarray:
        """Extract features from a price window."""
        return np.array([
            window[-1],
            window[-5:].mean(),
            window[-10:].mean(),
            window[-20:].mean() if len(window) >= 20 else window.mean(),
            window.std(),
            window[-5:].std(),
            window[-1] - window[-5],
            window[-1] - window[-10],
            window[-1] - window[0],
            (window[-1] - window.min()) / (window.max() - window.min() + 1e-10),
            np.diff(window[-10:]).mean(),
            np.diff(window).mean(),
        ])


class RandomForestPredictor:
    """Feature-based prediction using engineered technical indicators + fundamentals + sentiment."""

    def __init__(self):
        self.model = RandomForestRegressor(
            n_estimators=300,
            max_depth=8,
            min_samples_leaf=5,
            random_state=42,
            n_jobs=-1,
        )
        self.is_trained = False
        self._fundamentals = None
        self._sentiment = None
        self._delivery_data = None
        self._fiidii_data = None

    def train(
        self,
        prices: list[float],
        fundamentals: Optional[dict] = None,
        sentiment: Optional[dict] = None,
        delivery_data: Optional[dict] = None,
        fiidii_data: Optional[dict] = None,
    ):
        """Train on technical + fundamental + sentiment + delivery + FII/DII features."""
        self._fundamentals = fundamentals
        self._sentiment = sentiment
        self._delivery_data = delivery_data
        self._fiidii_data = fiidii_data

        df = compute_features(prices, fundamentals, sentiment, delivery_data, fiidii_data)
        feature_cols = get_feature_columns()

        df_clean = df.dropna(subset=feature_cols + ["target"])

        X = df_clean[feature_cols].values
        y = df_clean["target"].values

        self.model.fit(X, y)
        self.is_trained = True

    def predict_days(self, prices: list[float], days: int = 30) -> list[float]:
        """Predict iteratively: predict next day return -> update prices -> repeat."""
        if not self.is_trained:
            raise ValueError("Model not trained.")

        current_prices = list(prices)
        predictions = []

        for _ in range(days):
            df = compute_features(current_prices, self._fundamentals, self._sentiment, self._delivery_data, self._fiidii_data)
            feature_cols = get_feature_columns()
            last_row = df[feature_cols].iloc[-1:].values
            last_row = np.nan_to_num(last_row, nan=0.0)

            predicted_return = self.model.predict(last_row)[0]
            predicted_return = np.clip(predicted_return, -0.05, 0.05)
            next_price = current_prices[-1] * (1 + predicted_return)
            predictions.append(float(next_price))
            current_prices.append(next_price)

        return predictions


class LinearRegressionPredictor:
    """Simple trend-based baseline model with fundamentals + sentiment."""

    def __init__(self):
        self.model = LinearRegression()
        self.is_trained = False
        self._fundamentals = None
        self._sentiment = None
        self._delivery_data = None
        self._fiidii_data = None

    def train(
        self,
        prices: list[float],
        fundamentals: Optional[dict] = None,
        sentiment: Optional[dict] = None,
        delivery_data: Optional[dict] = None,
        fiidii_data: Optional[dict] = None,
    ):
        """Train on technical + fundamental + sentiment + delivery + FII/DII features."""
        self._fundamentals = fundamentals
        self._sentiment = sentiment
        self._delivery_data = delivery_data
        self._fiidii_data = fiidii_data

        df = compute_features(prices, fundamentals, sentiment, delivery_data, fiidii_data)
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
            df = compute_features(current_prices, self._fundamentals, self._sentiment, self._delivery_data, self._fiidii_data)
            feature_cols = get_feature_columns()
            last_row = df[feature_cols].iloc[-1:].values
            last_row = np.nan_to_num(last_row, nan=0.0)

            predicted_return = self.model.predict(last_row)[0]
            predicted_return = np.clip(predicted_return, -0.05, 0.05)
            next_price = current_prices[-1] * (1 + predicted_return)
            predictions.append(float(next_price))
            current_prices.append(next_price)

        return predictions