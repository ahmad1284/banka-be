const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pkg = require('./package.json');

// App constants
const port = process.env.PORT || 5000;
const apiPrefix = '/api';
const DB_FILE = path.join(__dirname, 'db.json');

// Load database from file or use default data
let db;
if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading db file, using default data', err);
    db = {
      test: {
        user: 'test',
        currency: '$',
        description: 'Test account',
        balance: 75,
        transactions: [
          { id: '1', date: '2020-10-01', object: 'Pocket money', amount: 50 },
          { id: '2', date: '2020-10-03', object: 'Book', amount: -10 },
          { id: '3', date: '2020-10-04', object: 'Sandwich', amount: -5 }
        ],
      }
    };
  }
} else {
  db = {
    test: {
      user: 'test',
      currency: '$',
      description: 'Test account',
      balance: 75,
      transactions: [
        { id: '1', date: '2020-10-01', object: 'Pocket money', amount: 50 },
        { id: '2', date: '2020-10-03', object: 'Book', amount: -10 },
        { id: '3', date: '2020-10-04', object: 'Sandwich', amount: -5 }
      ],
    }
  };
}

// Helper function to save the db to file
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Create the Express app & setup middlewares
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const allowedOrigins = [
  /http:\/\/(127(\.\d){3}|localhost)/,
  'https://banka-chi.vercel.app',
  'https://kigombo.live',
  'https://kigombo.vercel.app',
  'https://kigombo.gohimma.xyz'
];
app.use(cors({ origin: allowedOrigins }));
app.options('*', cors());

// ***************************************************************************
// Configure routes
const router = express.Router();

// Get server infos
router.get('/', (req, res) => {
  return res.send(`${pkg.description} v${pkg.version}`);
});

// ----------------------------------------------
// Create an account
router.post('/accounts', (req, res) => {
  // Check mandatory request parameters
  if (!req.body.user || !req.body.currency) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  // Check if account already exists
  if (db[req.body.user]) {
    return res.status(409).json({ error: 'User already exists' });
  }
  // Convert balance to number if needed
  let balance = req.body.balance;
  if (balance && typeof balance !== 'number') {
    balance = parseFloat(balance);
    if (isNaN(balance)) {
      return res.status(400).json({ error: 'Balance must be a number' });
    }
  }
  // Create account
  const account = {
    user: req.body.user,
    currency: req.body.currency,
    description: req.body.description || `${req.body.user}'s budget`,
    balance: balance || 0,
    transactions: [],
  };
  db[req.body.user] = account;
  saveDB();  // persist the new account to file
  return res.status(201).json(account);
});

// ----------------------------------------------
// Get all data for the specified account
router.get('/accounts/:user', (req, res) => {
  const account = db[req.params.user];
  // Check if account exists
  if (!account) {
    return res.status(404).json({ error: 'Username or password does not exist' });
  }
  return res.json(account);
});

// ----------------------------------------------
// Remove specified account
router.delete('/accounts/:user', (req, res) => {
  const account = db[req.params.user];
  // Check if account exists
  if (!account) {
    return res.status(404).json({ error: 'User does not exist' });
  }
  // Remove account
  delete db[req.params.user];
  saveDB();  // persist deletion to file
  res.sendStatus(204);
});

// ----------------------------------------------
// Add a transaction to a specific account
router.post('/accounts/:user/transactions', (req, res) => {
  const account = db[req.params.user];
  // Check if account exists
  if (!account) {
    return res.status(404).json({ error: 'User does not exist' });
  }
  // Check mandatory request parameters
  if (!req.body.date || !req.body.object || !req.body.amount) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  // Convert amount to number if needed
  let amount = req.body.amount;
  if (amount && typeof amount !== 'number') {
    amount = parseFloat(amount);
  }
  // Check that amount is a valid number
  if (amount && isNaN(amount)) {
    return res.status(400).json({ error: 'Amount must be a number' });
  }
  // Generate an ID for the transaction
  const id = crypto
    .createHash('md5')
    .update(req.body.date + req.body.object + req.body.amount)
    .digest('hex');
  // Check that transaction does not already exist
  if (account.transactions.some((transaction) => transaction.id === id)) {
    return res.status(409).json({ error: 'Transaction already exists' });
  }
  // Add transaction
  const transaction = {
    id,
    date: req.body.date,
    object: req.body.object,
    amount,
  };
  account.transactions.push(transaction);
  // Update balance
  account.balance += transaction.amount;
  saveDB();  // persist transaction addition
  return res.status(201).json(transaction);
});

// ----------------------------------------------
// Remove specified transaction from account
router.delete('/accounts/:user/transactions/:id', (req, res) => {
  const account = db[req.params.user];
  // Check if account exists
  if (!account) {
    return res.status(404).json({ error: 'User does not exist' });
  }
  const transactionIndex = account.transactions.findIndex(
    (transaction) => transaction.id === req.params.id
  );
  // Check if transaction exists
  if (transactionIndex === -1) {
    return res.status(404).json({ error: 'Transaction does not exist' });
  }
  // Remove transaction
  account.transactions.splice(transactionIndex, 1);
  saveDB();  // persist removal of transaction
  res.sendStatus(204);
});

// ***************************************************************************
// Add '/api' prefix to all routes
app.use(apiPrefix, router);

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
