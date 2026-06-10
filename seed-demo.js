// Script de données de démonstration — exécuter avec: node seed-demo.js
const db = require('./database');

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// Clients demo
const clients = [
  { name: 'Pierre Lefebvre', phone: '514-555-1001', email: 'pierre@email.com' },
  { name: 'Antoine Bernard', phone: '514-555-1002', email: 'antoine@email.com' },
  { name: 'Mathieu Roy', phone: '514-555-1003', email: null },
  { name: 'Sébastien Gagnon', phone: '514-555-1004', email: 'seb@email.com' },
  { name: 'Nicolas Martin', phone: '514-555-1005', email: null },
];

const insertClient = db.prepare('INSERT OR IGNORE INTO clients (name, phone, email) VALUES (?, ?, ?)');
clients.forEach(c => insertClient.run(c.name, c.phone, c.email));

const allClients = db.prepare('SELECT id FROM clients ORDER BY id ASC').all();

// Appointments demo
const appointments = [
  { client_id: allClients[0]?.id, barber_id: 1, service_id: 1, date: today, time: '09:00', status: 'confirmed' },
  { client_id: allClients[1]?.id, barber_id: 2, service_id: 2, date: today, time: '10:00', status: 'pending' },
  { client_id: allClients[2]?.id, barber_id: 1, service_id: 3, date: today, time: '11:30', status: 'confirmed' },
  { client_id: allClients[3]?.id, barber_id: 3, service_id: 4, date: tomorrow, time: '14:00', status: 'pending' },
  { client_id: allClients[0]?.id, barber_id: 2, service_id: 1, date: yesterday, time: '15:00', status: 'completed' },
  { client_id: allClients[4]?.id, barber_id: 1, service_id: 5, date: yesterday, time: '10:30', status: 'completed' },
];

const insertAppt = db.prepare('INSERT OR IGNORE INTO appointments (client_id, barber_id, service_id, date, time, status) VALUES (?, ?, ?, ?, ?, ?)');
appointments.forEach(a => { if (a.client_id) insertAppt.run(a.client_id, a.barber_id, a.service_id, a.date, a.time, a.status); });

// Transactions demo
const transactions = [
  { type: 'income', category: 'service', description: 'Coupe classique - Pierre Lefebvre', amount: 25, date: yesterday },
  { type: 'income', category: 'service', description: 'Coupe + Soin - Nicolas Martin', amount: 55, date: yesterday },
  { type: 'income', category: 'product', description: 'Vente de cire capillaire', amount: 18, date: yesterday },
  { type: 'expense', category: 'supplies', description: 'Achat de lames de rasoir', amount: 45, date: yesterday },
  { type: 'expense', category: 'utilities', description: 'Facture d\'électricité', amount: 120, date: yesterday },
];

const insertTx = db.prepare('INSERT INTO transactions (type, category, description, amount, date) VALUES (?, ?, ?, ?, ?)');
transactions.forEach(t => insertTx.run(t.type, t.category, t.description, t.amount, t.date));

console.log('✓ Données de démonstration insérées avec succès !');
