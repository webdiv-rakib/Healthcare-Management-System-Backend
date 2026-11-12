import "dotenv/config";
import app from "./app";
import config from "./config";
import { prisma } from "./lib/prisma";
import { seedSuperAdmin } from "./utils/seed";

async function main() {
	try {
		await prisma.$connect();
		await seedSuperAdmin();
		console.log("Connected to the database successfully");
		app.listen(config.port, () => {
			console.log(`Server is running on port:${config.port}`);
		});
	} catch (error) {
		console.log("Error starting the server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
}
main();
