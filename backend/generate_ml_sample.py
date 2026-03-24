import pandas as pd
import random
import numpy as np

# Create 36 months of data
months = list(range(1, 37))
stores = ['Downtown', 'Suburbs', 'Mall']

data = []
for month in months:
    for store in stores:
        # Base sales
        base = 5000 if store == 'Mall' else (4000 if store == 'Downtown' else 3000)
        
        # Marketing spend
        marketing_spend = random.randint(500, 2000)
        
        # Seasonal bump (Summer = months 6, 7, 8)
        seasonality = 1.2 if month % 12 in [6, 7, 8] else 1.0
        
        # Competitor price
        competitor_price = round(random.uniform(15.99, 25.99), 2)
        
        # Weather
        weather = random.choice(['Sunny', 'Rainy', 'Cloudy', 'Snowy'])
        weather_multiplier = 0.8 if weather in ['Snowy', 'Rainy'] else 1.1
        
        # Calculate final target value (sales_volume)
        sales_volume = int(base * seasonality * weather_multiplier + (marketing_spend * 1.5))
        # Add some noise
        sales_volume += random.randint(-500, 500)
        
        data.append({
            'month_id': month,
            'store_type': store,
            'marketing_spend_usd': marketing_spend,
            'competitor_price_usd': competitor_price,
            'weather_condition': weather,
            'sales_volume': sales_volume
        })

df = pd.DataFrame(data)
df.to_excel('sample_ml_prediction_data.xlsx', index=False)
print("Created sample_ml_prediction_data.xlsx successfully!")
