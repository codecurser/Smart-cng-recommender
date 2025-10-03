from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import numpy as np
import pandas as pd
from datetime import datetime

class WaitTimePredictor:
    def __init__(self):
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        self.scaler = StandardScaler()
        self.is_trained = False
        
    def _prepare_features(self, station_data):
        """Convert station data into feature matrix"""
        features = []
        for station in station_data:
            feature_vector = [
                station['active_chargers'],
                station['total_chargers'],
                station['current_queue_length'],
                station['hour_of_day'],
                station['day_of_week'],
                station['is_weekend'],
                station['traffic_density'],
                station['historical_avg_wait_time']
            ]
            features.append(feature_vector)
        return np.array(features)

    def train(self, training_data, wait_times):
        """Train the model with historical data"""
        X = self._prepare_features(training_data)
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled, wait_times)
        self.is_trained = True

    def predict_wait_time(self, station_data):
        """Predict waiting times for stations"""
        if not self.is_trained:
            # If model isn't trained, use a simple heuristic
            return self._heuristic_prediction(station_data)
        
        X = self._prepare_features(station_data)
        X_scaled = self.scaler.transform(X)
        predictions = self.model.predict(X_scaled)
        
        return [{
            'station_id': station['id'],
            'predicted_wait': max(0, pred),  # Ensure non-negative wait times
            'confidence': self._calculate_confidence(station)
        } for station, pred in zip(station_data, predictions)]

    def _heuristic_prediction(self, station_data):
        """Simple heuristic for wait time prediction when model isn't trained"""
        predictions = []
        for station in station_data:
            # Basic calculation based on queue length and available chargers
            if station['active_chargers'] == 0:
                wait_time = station['historical_avg_wait_time']
            else:
                wait_time = (station['current_queue_length'] * 20) / station['active_chargers']
                # Adjust based on historical average
                wait_time = (wait_time + station['historical_avg_wait_time']) / 2
            
            predictions.append({
                'station_id': station['id'],
                'predicted_wait': max(0, wait_time),
                'confidence': 0.6  # Lower confidence for heuristic prediction
            })
        return predictions

    def _calculate_confidence(self, station):
        """Calculate confidence score for the prediction"""
        # Factors affecting confidence
        factors = {
            'data_quality': min(1.0, station.get('data_completeness', 0.8)),
            'traffic_certainty': min(1.0, 1 - abs(0.5 - station['traffic_density'])),
            'queue_stability': min(1.0, 1 / (1 + station['current_queue_length'] * 0.1)),
            'charger_reliability': min(1.0, station['active_chargers'] / station['total_chargers'])
        }
        
        # Weighted average of factors
        weights = {
            'data_quality': 0.4,
            'traffic_certainty': 0.2,
            'queue_stability': 0.2,
            'charger_reliability': 0.2
        }
        
        confidence = sum(factor * weights[name] for name, factor in factors.items())
        return min(1.0, max(0.0, confidence)) 