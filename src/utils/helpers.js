const crypto = require("crypto");
const { sql } = require("../config/database");

// Fonction de hachage SHA512
function hashPassword(password) {
  return crypto.createHash('sha512').update(password).digest('hex');
}

// Fonction pour calculer le total avec TVA (20%)
function calculateTotalWithVAT(productIds, products) {
  const subtotal = productIds.reduce((sum, productId) => {
    const product = products.find(p => p.id === productId);
    return sum + (product ? product.price : 0);
  }, 0);
  
  return Math.round((subtotal * 1.2) * 100) / 100; // TVA 20% arrondie à 2 décimales
}

// Fonction pour récupérer les détails complets d'une commande
async function getOrderDetails(order) {
  // Récupérer l'utilisateur
  const [user] = await sql`
    SELECT id, username, email, created_at, updated_at 
    FROM users WHERE id = ${order.user_id}
  `;

  // Récupérer les produits
  const products = await sql`
    SELECT * FROM products WHERE id = ANY(${order.product_ids})
  `;

  return {
    ...order,
    user,
    products
  };
}

// Fonction pour récupérer les détails complets d'un produit avec ses avis
async function getProductDetails(product) {
  // Récupérer les avis du produit
  const reviews = await sql`
    SELECT r.*, u.username, u.email 
    FROM reviews r 
    JOIN users u ON r.user_id = u.id 
    WHERE r.product_id = ${product.id}
    ORDER BY r.created_at DESC
  `;

  return {
    ...product,
    reviews
  };
}

// Fonction pour mettre à jour le score total d'un produit
async function updateProductScore(productId) {
  // Calculer le nouveau score moyen
  const [result] = await sql`
    SELECT AVG(score) as avg_score, COUNT(*) as review_count
    FROM reviews 
    WHERE product_id = ${productId}
  `;

  const avgScore = result.avg_score ? Math.round(result.avg_score * 100) / 100 : 0;
  const reviewCount = result.review_count || 0;

  // Récupérer tous les IDs des avis
  const reviews = await sql`
    SELECT id FROM reviews WHERE product_id = ${productId} ORDER BY id
  `;
  const reviewIds = reviews.map(r => r.id);

  // Mettre à jour le produit
  await sql`
    UPDATE products 
    SET total_score = ${avgScore}, reviews_ids = ${reviewIds}
    WHERE id = ${productId}
  `;

  return { avgScore, reviewCount };
}

module.exports = {
  hashPassword,
  calculateTotalWithVAT,
  getOrderDetails,
  getProductDetails,
  updateProductScore
}; 