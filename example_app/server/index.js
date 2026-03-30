import express from 'express';
import cors from 'cors';
// import mongoose from 'mongoose';

const app = express();

// mongoose
//   .connect(process.env.MONGODB_URI)
//   .then(() => console.log('MongoDB connected'))
//   .catch((err) => console.error('MongoDB connection error:', err));

app.use(cors());
app.use(express.json());

// API routes go here

export const handler = app;
