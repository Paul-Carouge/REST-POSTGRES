const postgres = require("postgres");

const sql = postgres({ db: "mydb", user: "user", password: "password" });

// Initialisation de la base de données
async function initializeDatabase() {
  try {
    // Créer la table products si elle n'existe pas
    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        about TEXT NOT NULL,
        price DECIMAL(10,2) NOT NULL CHECK (price > 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Créer la table users si elle n'existe pas
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(128) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Créer la table orders si elle n'existe pas
    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_ids INTEGER[] NOT NULL,
        total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
        payment BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Créer la table reviews si elle n'existe pas
    await sql`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `;

    // Ajouter les colonnes reviews_ids et total_score à la table products si elles n'existent pas
    await sql`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS reviews_ids INTEGER[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS total_score DECIMAL(3,2) DEFAULT 0.00
    `;
    
    console.log("🟢 Base de données initialisée avec succès");
  } catch (error) {
    console.error("🔴 Erreur lors de l'initialisation de la base de données:", error);
    process.exit(1);
  }
}

module.exports = {
  sql,
  initializeDatabase
}; 