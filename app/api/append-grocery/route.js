import { MongoClient } from 'mongodb';
import { NextResponse } from 'next/server';

// Connection pooling state variables to optimize cache recycling
let cachedClient = null;
let cachedDb = null;

/**
 * Connects to MongoDB Atlas using pooled connections to prevent socket depletion
 */
async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI database connection variable is missing or empty.');
  }

  // Reuse in-memory client and db refs if already warmed up in the current serverless instance
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Re-use connection promise across warm-starts via the global namespace
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }

  const client = await global._mongoClientPromise;
  const db = client.db('groceryscout');

  // Cache variables locally for prompt routing
  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

export async function POST(request) {
  // 1. Security Protocol: Validate 'X-GroceryScout-Token' validation header
  const token = request.headers.get('X-GroceryScout-Token');
  const secretToken = process.env.GROCERY_SECRET_TOKEN || 
                      process.env.Grocery_SECRET_TOKEN || 
                      process.env.grocery_secret_token;

  if (!secretToken || token !== secretToken) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing or invalid secure authentication credentials' },
      { status: 401 }
    );
  }

  try {
    // 2. Parse the payload body
    const body = await request.json();
    const { key, data } = body;

    // Validate the incoming parameters
    if (!key || typeof data !== 'object' || data === null) {
      return NextResponse.json(
        { error: 'Bad Request: "key" string and "data" object are required in post request payload.' },
        { status: 400 }
      );
    }

    // 3. Connect to the pooled database driver
    const { db } = await connectToDatabase();
    const pricesCollection = db.collection('prices');

    // 4. Perform database upsert (insert or replace) targeting incoming key as _id
    const result = await pricesCollection.updateOne(
      { _id: key },
      { 
        $set: {
          _id: key,
          ...data,
          synchronized_at: new Date()
        }
      },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      message: `Successfully synchronized pricing record under target key: ${key}`,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
      upsertedId: result.upsertedId ? result.upsertedId._id || result.upsertedId : key,
    });

  } catch (error) {
    console.error('Error handling grocery sync API request:', error);
    return NextResponse.json(
      { 
        error: 'Internal Server Error',
        details: error.message || String(error)
      },
      { status: 500 }
    );
  }
}
