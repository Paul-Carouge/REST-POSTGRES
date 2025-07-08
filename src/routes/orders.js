const express = require("express");
const router = express.Router();
const { sql } = require("../config/database");
const { OrderSchema, OrderUpdateSchema } = require("../models/schemas");
const { calculateTotalWithVAT, getOrderDetails } = require("../utils/helpers");

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Récupère toutes les commandes
 *     description: Récupère la liste des commandes avec pagination et détails complets (utilisateur + produits)
 *     tags: [Commandes]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numéro de page pour la pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nombre d'éléments par page
 *     responses:
 *       200:
 *         description: Liste des commandes avec détails complets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Récupération de toutes les commandes avec pagination de 10 commandes par page
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const orders = await sql`
      SELECT * FROM orders 
      ORDER BY created_at DESC 
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Compter le nombre total de commandes pour la pagination
    const [{ count }] = await sql`SELECT COUNT(*) as count FROM orders`;
    const totalPages = Math.ceil(count / limit);

    // Récupérer les détails complets pour chaque commande
    const ordersWithDetails = await Promise.all(
      orders.map(order => getOrderDetails(order))
    );

    res.json({
      orders: ordersWithDetails,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des commandes:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Récupération d'une commande par son ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [order] = await sql`
      SELECT * FROM orders WHERE id = ${id}
    `;

    // Cas où la commande n'existe pas
    if (!order) {
      return res.status(404).json({ error: "Commande non trouvée" });
    }

    // Récupérer les détails complets
    const orderWithDetails = await getOrderDetails(order);

    res.json(orderWithDetails);
  } catch (error) {
    console.error("Erreur lors de la récupération de la commande:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Crée une nouvelle commande
 *     description: Crée une nouvelle commande avec calcul automatique du total avec TVA (20%)
 *     tags: [Commandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - productIds
 *             properties:
 *               userId:
 *                 type: integer
 *                 minimum: 1
 *                 example: 1
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 minItems: 1
 *                 example: [1, 2, 3]
 *     responses:
 *       201:
 *         description: Commande créée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         description: Utilisateur ou produit non trouvé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Utilisateur non trouvé"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Création d'une nouvelle commande
router.post("/", async (req, res) => {
  try {
    const result = await OrderSchema.safeParse(req.body);
    
    if (result.success) {
      const { userId, productIds } = result.data;

      // Vérifier si l'utilisateur existe
      const [user] = await sql`
        SELECT id FROM users WHERE id = ${userId}
      `;

      if (!user) {
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      }

      // Vérifier si tous les produits existent
      const products = await sql`
        SELECT * FROM products WHERE id = ANY(${productIds})
      `;

      if (products.length !== productIds.length) {
        return res.status(404).json({ 
          error: "Un ou plusieurs produits n'existent pas" 
        });
      }

      // Calculer le total avec TVA
      const total = calculateTotalWithVAT(productIds, products);

      const [newOrder] = await sql`
        INSERT INTO orders (user_id, product_ids, total, payment)
        VALUES (${userId}, ${productIds}, ${total}, FALSE)
        RETURNING *
      `;

      // Récupérer les détails complets
      const orderWithDetails = await getOrderDetails(newOrder);

      res.status(201).json(orderWithDetails);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la création de la commande:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Mise à jour complète d'une commande
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await OrderUpdateSchema.safeParse(req.body);
    
    if (result.success) {
      const { userId, productIds, payment } = result.data;
      
      // Vérifier si la commande existe
      const [existingOrder] = await sql`
        SELECT * FROM orders WHERE id = ${id}
      `;

      if (!existingOrder) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      // Préparer les données de mise à jour
      let updateData = {};
      let newTotal = existingOrder.total;

      if (userId) {
        // Vérifier si l'utilisateur existe
        const [user] = await sql`
          SELECT id FROM users WHERE id = ${userId}
        `;
        if (!user) {
          return res.status(404).json({ error: "Utilisateur non trouvé" });
        }
        updateData.user_id = userId;
      }

      if (productIds) {
        // Vérifier si tous les produits existent
        const products = await sql`
          SELECT * FROM products WHERE id = ANY(${productIds})
        `;
        if (products.length !== productIds.length) {
          return res.status(404).json({ 
            error: "Un ou plusieurs produits n'existent pas" 
          });
        }
        updateData.product_ids = productIds;
        newTotal = calculateTotalWithVAT(productIds, products);
      }

      if (payment !== undefined) {
        updateData.payment = payment;
      }

      // Construire la requête SQL de manière conditionnelle
      let updatedOrder;
      if (userId && productIds && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, product_ids = ${productIds}, total = ${newTotal}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId && productIds) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, product_ids = ${productIds}, total = ${newTotal}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (productIds && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET product_ids = ${productIds}, total = ${newTotal}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (productIds) {
        [updatedOrder] = await sql`
          UPDATE orders SET product_ids = ${productIds}, total = ${newTotal}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      }

      // Récupérer les détails complets
      const orderWithDetails = await getOrderDetails(updatedOrder);

      res.json(orderWithDetails);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la commande:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Mise à jour partielle d'une commande
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await OrderUpdateSchema.safeParse(req.body);
    
    if (result.success) {
      const { userId, productIds, payment } = result.data;
      
      // Vérifier si la commande existe
      const [existingOrder] = await sql`
        SELECT * FROM orders WHERE id = ${id}
      `;

      if (!existingOrder) {
        return res.status(404).json({ error: "Commande non trouvée" });
      }

      // Préparer les données de mise à jour
      let updateData = {};
      let newTotal = existingOrder.total;

      if (userId) {
        // Vérifier si l'utilisateur existe
        const [user] = await sql`
          SELECT id FROM users WHERE id = ${userId}
        `;
        if (!user) {
          return res.status(404).json({ error: "Utilisateur non trouvé" });
        }
        updateData.user_id = userId;
      }

      if (productIds) {
        // Vérifier si tous les produits existent
        const products = await sql`
          SELECT * FROM products WHERE id = ANY(${productIds})
        `;
        if (products.length !== productIds.length) {
          return res.status(404).json({ 
            error: "Un ou plusieurs produits n'existent pas" 
          });
        }
        updateData.product_ids = productIds;
        newTotal = calculateTotalWithVAT(productIds, products);
      }

      if (payment !== undefined) {
        updateData.payment = payment;
      }

      // Construire la requête SQL de manière conditionnelle
      let updatedOrder;
      if (userId && productIds && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, product_ids = ${productIds}, total = ${newTotal}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId && productIds) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, product_ids = ${productIds}, total = ${newTotal}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (productIds && payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET product_ids = ${productIds}, total = ${newTotal}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (userId) {
        [updatedOrder] = await sql`
          UPDATE orders SET user_id = ${userId}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (productIds) {
        [updatedOrder] = await sql`
          UPDATE orders SET product_ids = ${productIds}, total = ${newTotal}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      } else if (payment !== undefined) {
        [updatedOrder] = await sql`
          UPDATE orders SET payment = ${payment}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
        `;
      }

      // Récupérer les détails complets
      const orderWithDetails = await getOrderDetails(updatedOrder);

      res.json(orderWithDetails);
    } else {
      res.status(400).json({ 
        error: "Données invalides", 
        details: result.error.errors 
      });
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour partielle de la commande:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

// Suppression d'une commande
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const [deletedOrder] = await sql`
      DELETE FROM orders WHERE id = ${id}
      RETURNING *
    `;

    // Cas où la commande n'existe pas
    if (!deletedOrder) {
      return res.status(404).json({ error: "Commande non trouvée" });
    }

    // Récupérer les détails complets avant suppression
    const orderWithDetails = await getOrderDetails(deletedOrder);

    res.json({ 
      message: "Commande supprimée avec succès", 
      order: orderWithDetails 
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la commande:", error);
    res.status(500).json({ error: "Erreur du serveur" });
  }
});

module.exports = router; 