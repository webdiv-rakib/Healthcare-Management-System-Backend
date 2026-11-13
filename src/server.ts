import "dotenv/config";
import app from "./app";
import config from "./config";
import { prisma } from "./lib/prisma";
import { seedSuperAdmin, seedTestAdmin, seedTestDoctor } from "./utils/seed";
import { redisClient } from "./lib/redis";

async function main() {
	try {
		await prisma.$connect();
		console.log("Connected to the database successfully");
		await redisClient.connect();
		console.log("Redis Connected Successfully");
		await seedSuperAdmin();
		await seedTestAdmin();
		await seedTestDoctor();
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
