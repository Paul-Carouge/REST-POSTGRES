const app = require("./app");
const { initializeDatabase } = require("./config/database");

const port = 8000;

// Démarrage du serveur avec initialisation de la base de données
async function startServer() {
  await initializeDatabase();
  
  app.listen(port, () => {
    console.log(`🟢 Le serveur est lancé sur http://localhost:${port}`);
    console.log(`📚 Documentation Swagger disponible sur http://localhost:${port}/api-docs`);
  });
}

startServer(); 