const express = require("express");
const router = express.Router();

/**
 * @swagger
 * /f2p-games:
 *   get:
 *     summary: Récupère des jeux Free-to-Play
 *     description: Récupère des jeux Free-to-Play depuis l'API FreeToGame avec filtres optionnels
 *     tags: [Jeux Free-to-Play]
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *           enum: [pc, browser, all]
 *         description: Plateforme des jeux (pc, browser, all)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Catégorie des jeux (mmorpg, shooter, pvp, etc.)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [release-date, popularity, alphabetical, relevance]
 *         description: Méthode de tri
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Tags multiples séparés par des points (ex: 3d.mmorpg.fantasy.pvp)
 *     responses:
 *       200:
 *         description: Liste des jeux Free-to-Play
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 games:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Game'
 *                 total:
 *                   type: integer
 *                   example: 150
 *                 filters:
 *                   type: object
 *                   properties:
 *                     platform:
 *                       type: string
 *                     category:
 *                       type: string
 *                     sortBy:
 *                       type: string
 *                     tag:
 *                       type: string
 *                 apiSource:
 *                   type: string
 *                   example: "FreeToGame API"
 *       500:
 *         description: Erreur lors de la récupération des jeux
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Erreur lors de la récupération des jeux"
 *                 details:
 *                   type: string
 *                   example: "Erreur API FreeToGame: 500 Internal Server Error"
 */
// Récupération de tous les jeux Free-to-Play avec filtres optionnels
router.get("/", async (req, res) => {
  try {
    const { platform, category, sortBy, tag } = req.query;
    
    // Construire l'URL de l'API FreeToGame avec les paramètres
    let apiUrl = "https://www.freetogame.com/api/games";
    const params = new URLSearchParams();
    
    if (platform) params.append("platform", platform);
    if (category) params.append("category", category);
    if (sortBy) params.append("sort-by", sortBy);
    
    // Si on a des tags, utiliser l'endpoint /filter
    if (tag) {
      apiUrl = "https://www.freetogame.com/api/filter";
      params.append("tag", tag);
      if (platform) params.append("platform", platform);
      if (sortBy) params.append("sort", sortBy);
    }
    
    if (params.toString()) {
      apiUrl += "?" + params.toString();
    }

    console.log(`🔄 Appel API FreeToGame: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`Erreur API FreeToGame: ${response.status} ${response.statusText}`);
    }
    
    const games = await response.json();
    
    // Ajouter des informations de pagination si nécessaire
    const result = {
      games,
      total: games.length,
      filters: {
        platform: platform || "all",
        category: category || "all",
        sortBy: sortBy || "relevance",
        tag: tag || null
      },
      apiSource: "FreeToGame API"
    };
    
    res.json(result);
  } catch (error) {
    console.error("Erreur lors de la récupération des jeux Free-to-Play:", error);
    res.status(500).json({ 
      error: "Erreur lors de la récupération des jeux",
      details: error.message 
    });
  }
});

// Récupération des détails d'un jeu spécifique grace à son ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "ID de jeu invalide" });
    }
    
    const apiUrl = `https://www.freetogame.com/api/game?id=${id}`;
    
    console.log(`🔄 Appel API FreeToGame pour le jeu ID ${id}: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: "Jeu non trouvé" });
      }
      throw new Error(`Erreur API FreeToGame: ${response.status} ${response.statusText}`);
    }
    
    const game = await response.json();
    
    const result = {
      game,
      apiSource: "FreeToGame API"
    };
    
    res.json(result);
  } catch (error) {
    console.error("Erreur lors de la récupération du jeu:", error);
    res.status(500).json({ 
      error: "Erreur lors de la récupération du jeu",
      details: error.message 
    });
  }
});

module.exports = router; 