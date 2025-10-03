import numpy as np
from scipy.stats import bayes_mvs
import pandas as pd

class LocationOptimizer:
    def __init__(self):
        self.area_types = ["Market", "Office", "Residential", "School", "Factory", "Hospital"]
        self.traffic_flow = self._initialize_traffic_flow()
        
    def _initialize_traffic_flow(self):
        """Initialize traffic flow patterns for different area types"""
        return {
            'Market': {
                'weekday': {'morning': 0.6, 'afternoon': 0.8, 'evening': 0.9},
                'weekend': {'morning': 0.7, 'afternoon': 0.9, 'evening': 0.8}
            },
            'Office': {
                'weekday': {'morning': 0.9, 'afternoon': 0.5, 'evening': 0.8},
                'weekend': {'morning': 0.2, 'afternoon': 0.1, 'evening': 0.1}
            },
            'Residential': {
                'weekday': {'morning': 0.7, 'afternoon': 0.4, 'evening': 0.8},
                'weekend': {'morning': 0.6, 'afternoon': 0.7, 'evening': 0.6}
            },
            'School': {
                'weekday': {'morning': 0.9, 'afternoon': 0.5, 'evening': 0.3},
                'weekend': {'morning': 0.1, 'afternoon': 0.2, 'evening': 0.1}
            },
            'Factory': {
                'weekday': {'morning': 0.8, 'afternoon': 0.8, 'evening': 0.7},
                'weekend': {'morning': 0.4, 'afternoon': 0.3, 'evening': 0.3}
            },
            'Hospital': {
                'weekday': {'morning': 0.7, 'afternoon': 0.7, 'evening': 0.7},
                'weekend': {'morning': 0.6, 'afternoon': 0.6, 'evening': 0.6}
            }
        }

    def calculate_vsf(self, grid_data):
        """Calculate Voltage Stability Factor for each node"""
        # Simplified VSF calculation
        n_nodes = len(grid_data)
        vsf_matrix = np.zeros((n_nodes, n_nodes))
        
        for i in range(n_nodes):
            for j in range(n_nodes):
                if i != j:
                    # Calculate distance between nodes
                    distance = np.sqrt(
                        (grid_data[i]['lat'] - grid_data[j]['lat'])**2 +
                        (grid_data[i]['lng'] - grid_data[j]['lng'])**2
                    )
                    # VSF is inversely proportional to distance
                    vsf_matrix[i][j] = 1 / (distance + 1e-6)
        
        return vsf_matrix

    def calculate_congestion_probability(self, area_data, time_info):
        """Calculate congestion probability using Bayesian approach"""
        total_nodes = len(area_data)
        probabilities = {}
        
        for area_type in self.area_types:
            # Get base traffic flow for the time period
            is_weekend = time_info['is_weekend']
            day_type = 'weekend' if is_weekend else 'weekday'
            time_of_day = time_info['time_of_day']  # 'morning', 'afternoon', or 'evening'
            
            base_flow = self.traffic_flow[area_type][day_type][time_of_day]
            
            # Count areas of this type
            type_count = sum(1 for node in area_data if node['type'] == area_type)
            
            # Calculate probability using Bayes theorem
            p_type = type_count / total_nodes
            p_congestion_given_type = base_flow
            p_congestion = sum(
                self.traffic_flow[a][day_type][time_of_day] * 
                (sum(1 for node in area_data if node['type'] == a) / total_nodes)
                for a in self.area_types
            )
            
            if p_congestion > 0:
                p_type_given_congestion = (p_congestion_given_type * p_type) / p_congestion
            else:
                p_type_given_congestion = 0
                
            probabilities[area_type] = p_type_given_congestion
            
        return probabilities

    def get_candidate_locations(self, nodes, time_info, min_distance=0.01):
        """Get candidate locations for new charging stations"""
        vsf_matrix = self.calculate_vsf(nodes)
        congestion_probs = self.calculate_congestion_probability(nodes, time_info)
        
        candidates = []
        for i, node in enumerate(nodes):
            if node['type'] != 'Residential':  # Exclude residential areas
                # Calculate score based on VSF and congestion probability
                vsf_score = np.mean(vsf_matrix[i])
                congestion_score = congestion_probs[node['type']]
                
                # Combined score (weighted average)
                score = 0.4 * vsf_score + 0.6 * congestion_score
                
                # Check minimum distance from existing candidates
                is_valid = True
                for candidate in candidates:
                    distance = np.sqrt(
                        (node['lat'] - candidate['location']['lat'])**2 +
                        (node['lng'] - candidate['location']['lng'])**2
                    )
                    if distance < min_distance:
                        is_valid = False
                        break
                
                if is_valid:
                    candidates.append({
                        'location': {'lat': node['lat'], 'lng': node['lng']},
                        'type': node['type'],
                        'score': score,
                        'vsf_score': vsf_score,
                        'congestion_score': congestion_score
                    })
        
        # Sort candidates by score
        candidates.sort(key=lambda x: x['score'], reverse=True)
        return candidates 