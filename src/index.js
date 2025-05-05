import db from './connect.js';
import express, { query } from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import sendMail from './mail.js'; 
import jwt from 'jsonwebtoken';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Start Session
app.use(session({
  resave: false,
  secret: process.env.SESSION_SECRET || 'mySecretKey', 
  saveUninitialized: false,
  cookie: { secure: false,httpOnly: true }
}));
app.get('/check-session', (req, res) => {
  if (req.session.user) {
    res.status(200).json({ status: 'authenticated' });
  } else {
    res.status(401).json({ status: 'unauthorized' });
  }
});

// Authenticate login
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  } else {
    res.status(401).send('<script>alert("Login Required"); window.location.href="/";</script>');
  }
}

// Check Admin
function isAdmin(req, res, next) {
  if (req.session.user.type == 'Admin') {
    return next();
  } else {
    res.clearCookie('connect.sid');
    res.status(403).send('<script>alert("Unauthorized User Action"); window.location.href="/";</script>');
  }
}

// Check Salesman
function isSalesman(req, res, next) {
  if (req.session.user.type == 'salesman') {
    return next();
  } else {
    res.clearCookie('connect.sid');
    res.status(403).send('<script>alert("Unauthorized User Action"); window.location.href="/";</script>');
  }
}

// login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// login POST request
app.post('/', (req, res) => {
  const { userid, password } = req.body;
  const isEmail = userid.endsWith('.com');
  const queryField = isEmail ? 'email' : 'username';

  db.get(`SELECT * FROM user WHERE ${queryField} = ?`, [userid.toLowerCase()], function (err, row) {
    if (err) {
      console.error('Error retrieving from table:', err.message);
      res.status(500).send('Internal server error');
      return;
    }
    if (!row) {
      console.log('User not found:', userid);
      return res.status(401).send('<script>alert("Invalid username or password"); window.location.href="/";</script>');
    }
    const isadmin = row.user_type == 'Admin';
    const file = isadmin ? 'dashboard' : 'home';

    const result = bcrypt.compareSync(password, row.password);
    if (result) {
      req.session.user = {
        id: row.user_id,
        type: row.user_type
      };
      return res.redirect(`/${file}`);
    } else {
      res.status(401).send('<script>alert("Invalid username or password"); location.href="/";</script>');
    }
  });
});

// load Dashboard page
app.get('/dashboard', isAuthenticated,isAdmin,(req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// load Home page
app.get('/home', isAuthenticated,isSalesman,(req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// load different page
app.get(`/sbbs/:file`,isAuthenticated,(req,res)=>{
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const { file } = req.params ;
  res.sendFile(path.join(__dirname, 'public', `${file}.html`));
})

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err.message);
      return res.status(500).send('Error logging out');
    }
    // Clear all session-related cookies
    res.clearCookie('connect.sid');
    res.redirect('/');
    console.log('User logged out');
  });
});

// salesman list
app.get('/get/salesman', isAuthenticated,isAdmin,(req, res) => {
  db.all(`SELECT * FROM user WHERE user_type=?`, ["salesman"], (err, rows) => {
    if (err) {
      throw err;
    }
    res.json(rows);
  });
});

// delete salesman
app.post('/delete/salesman/:id', isAuthenticated,isAdmin,(req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM user WHERE user_id = ? AND user_type = ?`, [id, 'salesman'], function (err) {
    if (err) {
      console.error('Error deleting from table:', err.message);
      res.status(500).send('Internal server error');
      return;
    }
    if (this.changes === 0) {
      res.status(404).send('Salesman not found');
      return;
    }
    res.status(200).send('<script>alert("salesman removed successfully"); window.location.href = "/sbbs/salesman";</script>');
  });
});

// register salesman
app.post('/register', isAuthenticated,isAdmin,(req, res) => {
  const { username, email } = req.body;
  const salt = bcrypt.genSaltSync(parseInt(process.env.SALT));
  const hashedPassword = bcrypt.hashSync('default123', salt);
  db.run(`INSERT INTO user (username, email, password, user_type) VALUES (?, ?, ?, ?)`, [username, email, hashedPassword, 'salesman'], function (err) {
    if (err) {
      console.error('Error inserting into table:', err.message);
      res.status(500).send('Internal server error');
      return;
    }
    res.status(201).send('<script>alert("User registered successfully"); window.location.href = "/sbbs/salesman";</script>');
  });
});

// item list
app.get('/get/item',isAuthenticated, (req, res) => {
  db.all(`SELECT * FROM item`, [], (err, rows) => {
    if (err) {
      throw err;
    }
    res.json(rows);
  });
});

// add item
app.post('/newitem',isAuthenticated,isAdmin, (req, res) => {
  const { item, weight, cgst, sgst, stock, category } = req.body;
  db.run(`INSERT INTO item (item, weight, cgst, sgst, stock, booked,category) VALUES (?, ?, ?, ?, ?, ?, ?)`, [item, weight, cgst, sgst, stock, '0', category], function (err) {
    if (err) {
      console.error('Error inserting into table:', err.message);
      res.status(500).send('Internal server error');
      return;
    }
    res.status(201).send('<script>alert("item added successfully"); location.href = "/sbbs/stock";</script>');
  });
});

// update item purchase
app.post('/add/purchase/:id',isAuthenticated,isAdmin,(req,res)=>{
  const{ id } =req.params
  const { quantity } = req.body;
  db.run(`UPDATE item SET stock = stock + ? WHERE item_id = ?`,[quantity,id],function(err){
    if (err){
      console.error('error updating item quantity',err.message,qty);
      res.status(500).send('Internal server Error');
      return;
    }
    res.status(201).send('<script>alert("Item quantity updated successfully"); window.location.href = "/sbbs/stock";</script>');
  });
});

// add customer
app.post('/registercustomer',isAuthenticated, (req, res) => {
  const { customer, email, phone_no, gst, address} = req.body;
  db.run(`INSERT INTO customer ( customer, address, gst, email, phone_no ) VALUES (?, ?, ?, ?, ?)`, [customer,address || "", gst.toUpperCase() || "", email, phone_no || ""], function (err) {
    if (err) {
      console.error('Error inserting into table:', err.message);
      const isadmin = req.session.user.type == 'Admin';
    const file = isadmin ? 'customer' : 'salesmanCustomer';
    res.status(201).send(`<script>alert("Customer Already Exists"); window.location.href = "/sbbs/${file}";</script>`);
      return;
    }
    const isadmin = req.session.user.type == 'Admin';
    const file = isadmin ? 'dashboard' : 'home';
    res.status(201).send(`<script>alert("Customer registered successfully"); window.location.href = "/${file}";</script>`);
  });
});

// customer list
app.get('/get/customer', isAuthenticated,(req, res) => {
  db.all(`SELECT * FROM customer`, [], (err, rows) => {
    if (err) {
      throw err;
    }
    res.json(rows);
  });
});

// suggest customer/item
app.get('/suggest/:table/:name_input',isAuthenticated, (req, res) => {
  const { table,name_input } = req.params;
  db.all(`SELECT ${table} FROM ${table} WHERE ${table} LIKE ? LIMIT 4`, [`%${name_input}%`], (err, rows) => {
    if (err) {
      console.error('Error fetching suggestions:', err.message);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
    const List = rows.map(row => row[table]);
    res.json(List);
  });
});

//add new order and order items
app.post('/submit/order',isAuthenticated,isSalesman, (req, res) => {
  const { customerName, note, orderDate, itemName, quantity } = req.body;
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('Error beginning transaction:', err.message);
        res.status(500).send('Internal server error');
        return;
      }

      db.get(`SELECT cust_id FROM customer WHERE customer = ?`, [customerName], (err, row) => {
        if (err) {
          console.error('Error fetching customer id:', err.message);
          db.run('ROLLBACK');
          res.status(500).send('Internal server error');
          return;
        }
        if (!row) {
          console.log('Customer not found:', customerName);
          db.run('ROLLBACK');
          res.status(404).send('Customer not found');
          return;
        }
        const cust_id = row.cust_id;
        const user_id = req.session.user.id;

        db.get(`SELECT order_id FROM \`order\` WHERE cust_id = ? AND status = 'placed'`, [cust_id], (err, row) => {
          if (err) {
            console.error('Error fetching order id:', err.message);
            db.run('ROLLBACK');
            res.status(500).send('Internal server error');
            return;
          }

          const order_id = row ? row.order_id : null;

          const insertOrUpdateOrder = (callback) => {
            if (order_id) {
              db.run(`UPDATE \`order\` SET note = ?, user_id = ? , date = ? WHERE order_id = ?`, [note || "null", user_id, orderDate, order_id], (err) => {
                if (err) {
                  console.error('Error updating order:', err.message);
                  db.run('ROLLBACK');
                  res.status(500).send('Internal server error');
                  return;
                }
                callback(order_id);
              });
            } else {
              db.run(`INSERT INTO \`order\` (cust_id, note, status, user_id, date) VALUES (?, ?, ?, ?, ?)`, [cust_id, note || "null", 'placed', user_id, orderDate], function (err) {
                if (err) {
                  console.error('Error inserting into table:', err.message);
                  db.run('ROLLBACK');
                  res.status(500).send('Internal server error');
                  return;
                }
                callback(this.lastID);
              });
            }
          };

          insertOrUpdateOrder((order_id) => {
            const insertOrderItems = (i) => {
              if (i >= (typeof itemName === 'string' ? 1 : itemName.length)) {
                db.run('COMMIT', (err) => {
                  if (err) {
                    console.error('Error committing transaction:', err.message);
                    res.status(500).send('Internal server error');
                    return;
                  }
                  res.status(201).send(`<script>alert('Order Submitted Successfully'); window.location.href='/home'</script>`);
                });
                return;
              }

              const currentItemName = typeof itemName === 'string' ? itemName : itemName[i];
              const currentQuantity = typeof quantity === 'string' ? quantity : quantity[i];

              db.get(`SELECT item_id FROM item WHERE item = ?`, [currentItemName], (err, row) => {
                if (err) {
                  console.error('Error fetching item id:', err.message);
                  db.run('ROLLBACK');
                  res.status(500).send('Internal server error');
                  return;
                }
                if (!row) {
                  console.log('Item not found:', currentItemName);
                  db.run('ROLLBACK');
                  res.status(404).send('Item not found');
                  return;
                }
                const item_id = row.item_id;

                db.run(`INSERT INTO order_item (order_id, item_id, qty) VALUES (?, ?, ?)`, [order_id, item_id, currentQuantity], function (err) {
                  
                  if (err) {
                    console.error('Error inserting into table:', err.message);
                    db.run('ROLLBACK');
                    if (err.code === "SQLITE_CONSTRAINT") {
                      res.status(500).send(`<script>alert('One or More Items Already Exist, Update Order Instead.'); window.location.href='/home'</script>`);
                    }
                    return;
                  }
                  db.run(`UPDATE item SET booked = booked + ? WHERE item_id = ?`, [currentQuantity, item_id], function (err) {
                    if (err) {
                      console.error('Error updating item quantity:', err.message);
                      db.run('ROLLBACK');
                      res.status(500).send('Internal server error');
                      return;
                    }

                    insertOrderItems(i + 1);
                  });
                });
              });
            };
            insertOrderItems(0);
          });
        });
      });
    });
  });
});

// order data
app.get('/get/order', isAuthenticated,(req, res) => {
  const req_id = req.session.user.id;
  const req_type=req.session.user.type;
  if (req_type == "Admin"){
    const query = `
    SELECT "order".*, customer.customer , user.username , user.user_type
    FROM "order"
    JOIN customer ON "order".cust_id = customer.cust_id
    JOIN user ON "order".user_id = user.user_id
    WHERE "order".status = ?`;
    
    db.all(query, ["placed"], (err, rows) => {
      if (err) {
        console.error('Error fetching orders:', err.message);
        res.status(500).send('Internal server error');
        return;
      }
      res.json(rows);
    });
  } else {
    const query = `
    SELECT "order".*, customer.customer , user.username , user.user_type
    FROM "order"
    JOIN customer ON "order".cust_id = customer.cust_id
    JOIN user ON "order".user_id = user.user_id
    WHERE user.user_id = ? AND "order".status = ?`;
    db.all(query, [req_id,"placed"], (err, rows) => {
      if (err) {
        console.error('Error fetching orders:', err.message);
        res.status(500).send('Internal server error');
        return;
      }
      res.json(rows);
    });
  }
});

// bill page
app.get('/generate/bill/:id',isAuthenticated,isAdmin, (req, res) => {
  const { id } = req.params;
  res.sendFile(path.join(__dirname, 'public', 'bill.html'), { headers: { 'order_id': id } });
});

// fetch details for bill
app.get('/set/billDetails/:id' , (req,res)=>{
    const{ id } = req.params;
    const query = `
    SELECT "order".* , customer.customer, customer.address, item.* , order_item.*
    FROM "order"
    JOIN customer ON "order".cust_id = customer.cust_id
    JOIN order_item ON "order".order_id = order_item.order_id
    JOIN item ON order_item.item_id = item.item_id 
    WHERE "order".order_id = ?`
    db.all(query, [id], (err, rows) => {
      if (err) {
        console.error('Error fetching orders:', err.message);
        res.status(500).send('Internal server error');
        return;
      }
      res.json(rows);
    });
});

// Sumbit bill
app.post('/submit/bill', isAuthenticated, isAdmin, (req, res) => {
  const {
    billDate, userId, orderId, driverName, vehicleNumber, customerName, grandTotal,
    itemName, sgst, cgst, itemQty, itemTotal, ratePerKg
  } = req.body;
  db.run('BEGIN TRANSACTION', (err) => {
    if (err) {
      console.error('Error beginning transaction:', err.message);
      return res.status(500).send('Internal server error');
    }

    // Get customer ID
    db.get(`SELECT cust_id FROM customer WHERE customer = ?`, [customerName], (err, row) => {
      if (err || !row) {
        console.error('Error fetching customer ID:', err?.message || "Customer not found");
        db.run('ROLLBACK');
        return res.status(500).send('Internal server error');
      }
      const cust_id = row.cust_id;

      // Insert bill data
      db.run(
        `INSERT INTO bill (date, cust_id, user_id, driver, vch_no, total) VALUES (?, ?, ?, ?, ?, ?)`,
        [billDate, cust_id, userId, driverName, vehicleNumber, grandTotal],
        function (err) {
          if (err) {
            console.error('Error inserting into bill:', err.message);
            db.run('ROLLBACK');
            return res.status(500).send('Internal server error');
          }

          const bill_id = this.lastID;

          db.get(
            `SELECT bill.*, customer.email FROM bill JOIN customer ON customer.cust_id = bill.cust_id WHERE bill_id = ?`,
            [bill_id],
            (err, row) => {
              if (err || !row) {
                console.error('Error fetching bill details:', err?.message || "Bill not found");
                db.run('ROLLBACK');
                return res.status(500).send('Internal server error');
              }
              const { date, email, driver, vch_no, total } = row;

              // Initialize PDF
              const pdfPath = `./bills/bill_${bill_id}.pdf`;
              const doc = new PDFDocument({ size: 'A4', margin: 50 });
              doc.pipe(fs.createWriteStream(pdfPath));
              const headerImage = './bills/BillHeader.png';
              const qrCodeImage = './bills/BillFooter.png';
              const margin = 50;
              doc.save();
              doc.fillOpacity(0.5).rect(margin, margin, 500 , doc.page.height - 2 * margin).fill('#FAF5EF');
              doc.restore();
              doc.fillColor('black');
              doc.image(headerImage, margin, 30, { width: 500 });
              doc.moveDown(6);
              doc.fontSize(12);
              doc.text(`Invoice No: ${bill_id}`, { align: 'right' });
              const formattedDate = new Date(row.date).toLocaleDateString('en-GB', {day: '2-digit',month: 'short',year: '2-digit'}).replace(',', '');
              doc.text(`Date: ${formattedDate}`, { align: 'right' });
              doc.moveDown(2);
              doc.fontSize(14).text(`Customer: ${customerName}`, margin + 8);
              doc.text(`Vehicle No: ${vehicleNumber}`, margin + 8);
              doc.text(`Driver: ${driverName}`, margin + 8);
              doc.moveDown(2);
              let startY = doc.y;
              doc.fillColor('black').fontSize(12).font('Helvetica-Bold');
              doc.text('ITEMS', margin + 5, startY);
              doc.text('QTY', 220, startY);
              doc.text('RATE', 270, startY);
              doc.text('SGST', 320, startY);
              doc.text('CGST', 370, startY);
              doc.text('TOTAL', 440, startY);
              doc.font('Helvetica').fillColor('black');

              // Ensure all fields are arrays
              const items = Array.isArray(itemName) ? itemName : [itemName];
              const quantities = Array.isArray(itemQty) ? itemQty : [itemQty];
              const rates = Array.isArray(ratePerKg) ? ratePerKg : [ratePerKg];
              const cgsts = Array.isArray(cgst) ? cgst : [cgst];
              const sgsts = Array.isArray(sgst) ? sgst : [sgst];
              const totals = Array.isArray(itemTotal) ? itemTotal : [itemTotal];

              let itemInsertPromises = items.map((item, i) => {
                return new Promise((resolve, reject) => {
                  db.get(`SELECT item_id FROM item WHERE item = ?`, [item], (err, row) => {
                    if (err || !row) {
                      console.error(`Error fetching item ID for ${item}:`, err?.message || "Item not found");
                      return reject(new Error(`Item not found: ${item}`));
                    }
                    const item_id = row.item_id;

                    db.run(
                      `INSERT INTO bill_item (bill_id, item_id, qty, rate, cgst, sgst, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                      [bill_id, item_id, quantities[i], rates[i], cgsts[i], sgsts[i], totals[i]],
                      (err) => {
                        if (err) {
                          console.error('Error inserting into bill_item:', err.message);
                          return reject(err);
                        }

                        db.run(
                          `UPDATE item SET stock = stock - ?, booked = booked - ? WHERE item_id = ?`,
                          [quantities[i], quantities[i], item_id],
                          (err) => {
                            if (err) {
                              console.error('Error updating item stock:', err.message);
                              return reject(err);
                            }
                            resolve(); // ✅ Ensure resolve() is called
                          }
                        );
                      }
                    );
                  });
                });
              });

              Promise.all(itemInsertPromises)
                .then(() => {
                  let yPosition = startY + 30;
                  items.forEach((item, i) => {
                    doc.text(item, margin + 8, yPosition);
                    doc.text(quantities[i].toString(), 220, yPosition);
                    doc.text(`${rates[i]}`, 270, yPosition);
                    doc.text(`${sgsts[i]} %`, 320, yPosition);
                    doc.text(`${cgsts[i]} %`, 370, yPosition);
                    doc.text(`${totals[i]}`, 440, yPosition);
                    yPosition += 25;
                  });

                  doc.moveDown(2);
                  doc.font('Helvetica-Bold').text(`Grand Total: ${grandTotal}`, { align: 'left' });
                  doc.image(qrCodeImage, margin, doc.page.height - 125, { width: 500 });
                  doc.end();

                  sendMail(email, `Your bill #${bill_id} is dispatched`,`<!DOCTYPE html>
                  <html>
                    <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #000;">
                      <div style="max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                        <h2 style="color: #4ade80; text-align: center;">Invoice ${bill_id} Dispatched</h2>
                        <p>Dear Customer,</p>
                        <p>Your order has been dispatched with <strong>${driver}</strong> on vehicle number <strong>${vch_no}</strong> on <strong>${date}</strong>.</p>
                        <p><strong>Total Amount:</strong> ₹${total}</p>
                        <p>Refer to the attached bill for more details.</p>
                        <p style="margin-top: 20px;">Thank you for your business!</p>
                      </div>
                    </body>
                  </html>`,pdfPath);

                  db.run(`UPDATE "order" SET status = ? WHERE order_id = ?`, ['delivered', orderId], (err) => {
                    if (err) {
                      console.error('Error updating order status:', err.message);
                      db.run('ROLLBACK');
                      return res.status(500).send('Internal server error');
                    }

                    db.run('COMMIT', (err) => {
                      if (err) {
                        console.error('Error committing transaction:', err.message);
                        return res.status(500).send('Internal server error');
                      }
                      res.status(201).send('<script>alert("Bill submitted successfully"); location.href = "/dashboard";</script>');
                    });
                  });
                })
                .catch((error) => {
                  console.error('Error processing bill items:', error.message);
                  db.run('ROLLBACK');
                  return res.status(500).send('Internal server error');
                });
            }
          );
        }
      );
    });
  });
});

// Genrate Jwt Token & Mail
app.post('/forget/password/:userid', (req, res) => {
  const { userid } = req.params;
 
  const field = userid.endsWith('.com') ? 'email' : 'username';
  db.get(`SELECT * FROM user WHERE ${field} = ? `, [userid], (err, row) => {
    if (err) {
      console.error('Error fetching user:', err.message);
      res.status(500).send('Internal server error');
      return;
    }
    if (!row) {
      console.log('User not found:');
      res.status(404).json({ message: 'user not found' });
      return;
    }
    const token = jwt.sign({ id: row.user_id },process.env.JWT_SECRET, { expiresIn: '10m' });
    sendMail(`${row.email}`, 'Password Recovery token', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Password Reset Request</title>
</head>
<body color:#fff; margin:0; padding:0; font-family: Arial, sans-serif;">
  <div style="max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
    <h1 style="font-size:32px; font-weight:bold; color:#4ade80; text-align:center; margin-bottom:20px;">
      Password Reset Request
    </h1>
    <p style="font-size:18px; margin-bottom:20px;">Hello,</p>
    <p style="font-size:16px; margin-bottom:20px;">
      We received a request to reset your password. Click the button below to reset your password.
      If you did not request a password reset, please ignore this email.
    </p>
    <div style="text-align:center; margin-bottom:20px;">
      <a href="${process.env.BASE_URL}/reset-password/${row.user_id}/${token}" 
         style="display:inline-block; background-color:#4ade80; color:#000; font-weight:bold; padding:15px 25px; text-decoration:none; border-radius:5px;">
        Reset Password
      </a>
    </div>
    <p style="font-size:16px; margin-bottom:20px;">
      If you're having trouble clicking the button, copy and paste the URL below into your browser:
    </p>
    <p style="font-size:14px; word-break:break-all;">http://localhost:3000/reset-password/${row.user_id}/${token}</p>
    <p style="font-size:12px; color:#aaa; text-align:center; margin-top:30px;">
    </p>
  </div>
</body>
</html>`);
    res.status(200).json({ message: 'Reset token sent to your email' });
  });
});

// Validate JWT token
app.get('/reset-password/:id/:token', (req, res) => {
  const { id,token } = req.params;
  jwt.verify(token, process.env.JWT_SECRET , (err, decoded) => {
    if (err) {
      console.error('Error verifying token:', err.message);
      res.status(401).send('<script>alert("Invaild Token"); window.location.href ="/";</script>');
      return;
    }
    if (decoded.id !== parseInt(id)) {
      console.error('Token ID mismatch:');
      return res.status(403).send('<script>alert("Unauthorized User Action"); window.location.href ="/";</script>');
    }
    res.sendFile(path.join(__dirname, 'public', '/resetPassword.html'));
  });
});

// Update password
app.post('/reset/password', async (req, res) => {
  const { userId,newPassword } = req.body;
  const salt = bcrypt.genSaltSync(parseInt(process.env.SALT));
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  db.run(`UPDATE user SET password = ? WHERE user_id = ?`, [hashedPassword, userId], function (err) {
    if(err){
      console.error('Error updating password:', err.message);
      res.status(500).send('Internal server error');
      return;
    }
    res.status(200).send('<script>alert("Password updated successfully"); window.location.href = "/";</script>');
  });
});

//Get user data
app.get ('/get/profile' ,isAuthenticated, (req,res)=>{
  const id = req.session.user.id;
  db.get(`SELECT user_id,username,email FROM user WHERE user_id =?` , [id] , (err,row)=>{
    if (err){
      console.error('Error fetiching data:', err.message);
      res.status(500).send('Internal server error');
      return;
    }
    res.json(row);
  })
})

// Update user data
app.post('/update/profile/:id',isAuthenticated, (req, res) => {
  const { id } = req.params;
  const { name,email } = req.body;
  db.run(`UPDATE user SET username = ?, email = ? WHERE user_id = ?`, [name, email, id], function (err) {
    if (err) {
      console.error('Error updating user:', err.message);
      res.status(500).send('Internal server error');
      return;
    }
    const usertype = req.session.user.type;
    if (usertype == "Admin"){
    res.status(200).send('<script>alert("Profile updated successfully"); location.href = "/dashboard";</script>');
    }
    else{
      res.status(200).send('<script>alert("Profile updated successfully"); location.href = "/home";</script>');
    }
  });
});

app.get(`/get/Customer/:id`,isAuthenticated,isAdmin,(req,res)=>{
  const {id} = req.params;
  db.get(`SELECT * FROM customer WHERE cust_id =?`,[id],(err,row)=>{
    if(err){
      console.error('Error fetching user:', err.message);
      res.status(500).send('Internal server error');
      return;
    }
    res.json(row);
  })
})

// update customer details
app.post('/update/customer/:id',isAuthenticated,isAdmin, (req, res) => {
  const { id } = req.params;
  const { customer,address,gst,email,phone_no } = req.body;
  db.run(`UPDATE customer SET customer = ?, address= ? ,gst = ? ,email= ?,phone_no = ? WHERE cust_id = ?`, [customer,address,gst,email,phone_no,id], function (err) {
    if (err) {
      console.error('Error updating user:', err.message);
      res.status(500).send('Internal server error');
      return;
    }
  res.status(200).send('<script>alert("Customer updated successfully"); location.href ="/sbbs/customer";</script>');
  });
});

// delete order item 
app.delete('/delete/item/:orderId/:itemName', isAuthenticated,(req, res) => {
  const { orderId, itemName } = req.params;

  db.get(`SELECT item_id FROM item WHERE item = ?`, [itemName], (err, row) => {
      if (err) {
          console.error('Error fetching item ID:', err);
          return res.status(500).json({ error: 'Database error while fetching item ID' });
      }
      if (!row) {
          return res.status(404).json({ error: 'Item not found' });
      }
      const itemId = row.item_id;

      db.run(
          `UPDATE item 
          SET booked = booked - (SELECT qty FROM order_item WHERE order_id = ? AND item_id = ?) 
          WHERE item_id = ?`,
          [orderId, itemId, itemId],
          (updateErr) => {
              if (updateErr) {
                  console.error('Error updating item:', updateErr);
                  return res.status(500).json({ error: 'Database error while updating item' });
              }

              db.run(`DELETE FROM order_item WHERE order_id = ? AND item_id = ?`, [orderId, itemId], (deleteErr) => {
                  if (deleteErr) {
                      console.error('Error deleting item:', deleteErr);
                      return res.status(500).json({ error: 'Database error while deleting item' });
                  }

                  db.get(`SELECT COUNT(*) as count FROM order_item WHERE order_id = ?`, [orderId], (countErr, countRow) => {
                      if (countErr) {
                          console.error('Error counting items:', countErr);
                          return res.status(500).json({ error: 'Database error while counting items' });
                      }

                      if (countRow.count === 0) {
                          db.run(`DELETE FROM "order" WHERE order_id = ?`, [orderId], (deleteOrderErr) => {
                              if (deleteOrderErr) {
                                  console.error('Error deleting order:', deleteOrderErr);
                                  return res.status(500).json({ error: 'Database error while deleting order' });
                              }

                              return res.json({ message: "Your order is empty", redirect: "/sbbs/home" });
                          });
                      } else {
                          return res.json({ message: "Item deleted successfully" });
                      }
                  });
              });
          }
      );
  });
});


// Update order item Qty
app.get('/update/order/:id',isAuthenticated,isSalesman, (req, res) => {
  const { id } = req.params;
  res.sendFile(path.join(__dirname, 'public', 'updateOrder.html'), { headers: { 'order_id': id } });
});
app.post('/update',isAuthenticated,isSalesman,(req, res) => {
  const { orderId, itemName, itemQty } = req.body;
  db.serialize(() => {
    db.get('PRAGMA busy_timeout = 30000', (err) => {
      if (err) {
        console.error('Error setting busy timeout:', err.message);
        res.status(500).send('Internal server error');
        return;
      }
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('Error beginning transaction:', err.message);
          res.status(500).send('Internal server error');
          return;
        }
        if (typeof itemName === 'string') {
          db.get(`SELECT item_id FROM item WHERE item = ?`, [itemName], (err, rows) => {
            if (err) {
              console.error('Error fetching item id:', err.message);
              db.run('ROLLBACK');
              res.status(500).send('Internal server error');
              return;
            } 
            db.get(`SELECT qty FROM order_item WHERE order_id = ? AND item_id = ?`, [orderId, rows.item_id], (err, row) => {
              if (err) {
                console.error('Error fetching order item:', err.message);
                db.run('ROLLBACK');
                res.status(500).send('Internal server error');
                return;
              }
              db.run(`UPDATE item SET booked = booked - ? WHERE item_id = ?`, [row.qty, rows.item_id], function (err) {
                if (err) {
                  console.error('Error updating item quantity:', err.message);
                  db.run('ROLLBACK');
                  res.status(500).send('Internal server error');
                  return;
                }
              });
              const item_id = rows.item_id;
              db.run(`UPDATE order_item SET qty = ? WHERE order_id = ? AND item_id = ?`, [itemQty, orderId, item_id], function (err) {
                if (err) {
                  console.error('Error updating order:', err.message);
                  db.run('ROLLBACK');
                  res.status(500).send('Internal server error');
                  return;
                }
              });
              db.run(`UPDATE item SET booked = booked + ? WHERE item_id = ?`, [itemQty, item_id], function (err) {
                if (err) {
                  console.error('Error updating item quantity:', err.message);
                  db.run('ROLLBACK');
                  res.status(500).send('Internal server error');
                  return;
                }
              });
            });
          });
        } else{
          for (let i=0; i<itemName.length; i++) {
            db.get(`SELECT item_id FROM item WHERE item = ?`, [itemName[i]], (err, rows) => {  
              if(err){
                console.error('Error fetching item id:', err.message);
                db.run('ROLLBACK');
                res.status(500).send('Internal server error');
                return;
              }
              db.get(`SELECT qty FROM order_item WHERE order_id = ? AND item_id = ?`, [orderId, rows.item_id], (err, row) => {
                if (err) {
                  console.error('Error fetching order item:', err.message);
                  db.run('ROLLBACK');
                  res.status(500).send('Internal server error');
                  return;
                }
                db.run(`UPDATE item SET booked = booked - ? WHERE item_id = ?`, [row.qty, rows.item_id], function (err) {
                  if (err) {
                    console.error('Error updating item quantity:', err.message);
                    db.run('ROLLBACK');
                    res.status(500).send('Internal server error');
                    return;
                  }
                });
                const item_id = rows.item_id;
                db.run(`UPDATE order_item SET qty = ? WHERE order_id = ? AND item_id = ?`, [itemQty[i], orderId, item_id], function (err) {
                  if (err) {
                    console.error('Error updating order:', err.message);
                    db.run('ROLLBACK');
                    res.status(500).send('Internal server error');
                    return;
                  }
                });
                db.run(`UPDATE item SET booked = booked + ? WHERE item_id = ?`, [itemQty[i], item_id], function (err) {
                  if (err) {
                    console.error('Error updating item quantity:', err.message);
                    db.run('ROLLBACK');
                    res.status(500).send('<script><alert>Internal server error</alert> location.href="/home"</script>');
                    return;
                  }
                });
              });
            });
          }
        }
        db.run('COMMIT', (err) => {
          if (err) {
            console.error('Error committing transaction:', err.message);
            res.status(500).send('Internal server error');
            return;
          }
          res.status(200).send('<script>alert("Order updated successfully"); location.href = "/home";</script>');
        });
      });
    });
  });
});

// Bill list
app.get('/get/bill',isAuthenticated,isAdmin, (req, res) => {
  db.all(`SELECT bill.* , customer.customer 
    FROM bill 
    JOIN customer on customer.cust_id = bill.cust_id `, [], (err, rows) => {
    if (err) {
      throw err;
    }
    res.json(rows);
  });
});

// get item list of a bill
app.get('/bill_item/:id',isAuthenticated,isAdmin , (req,res)=>{
  const { id } = req.params ;
  db.all(`SELECT bill_item.* , item.item
    FROM bill_item
    JOIN item ON item.item_id = bill_item.item_id
    WHERE bill_id = ?` , [id] , (err,rows)=>{
      if (err){
        res.status(500).send('Internal server error',err);
      }
      res.json(rows);
    })
})

//salesman sales pie charts
app.get('/salesman/sale', isAuthenticated,isAdmin,(req, res) => {
  db.all(`SELECT user.user_id, user.username, SUM(bill.total) AS total_sum
  FROM bill
  JOIN user ON user.user_id = bill.user_id
  GROUP BY user.user_id, user.username;`,[],(err,row)=>{
  if (err){
    res.status(500).send('Internal server error',err);
  }
  res.json(row);
  return;
})
});

//monthly sales bar chart
app.get('/monthly/sale', isAuthenticated,isAdmin,(req, res) => {
  db.all(`SELECT strftime('%Y-%m', bill.date) AS month, SUM(bill.total) AS total_sum
FROM bill
GROUP BY month
ORDER BY month;`,[],(err,row)=>{
  if (err){
    res.status(500).send('Internal server error',err);
  }
  res.json(row);
  return;
})
});

app.get('/category/sale', isAuthenticated,isAdmin,(req, res) => {
  db.all(`SELECT category , SUM(bill_item.total) AS total_sum
FROM bill_item
JOIN item on bill_item.item_id = item.item_id
GROUP BY category`,[],(err,row)=>{
  if (err){
    res.status(500).send('Internal server error',err);
  }
  res.json(row);
  return;
})
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});