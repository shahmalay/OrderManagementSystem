import sqlite3 from 'sqlite3' ;

// Open a database
var db = new sqlite3.Database('om.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

export default db;