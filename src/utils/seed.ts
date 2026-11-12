import bcrypt from "bcryptjs";
import { Role } from "../../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import config from "../config";

export const seedSuperAdmin = async () => {
	try {
		const isSuperAdminExists = await prisma.user.findFirst({
			where: {
				role: Role.SUPER_ADMIN,
			},
		});
		if (isSuperAdminExists) {
			console.log("Super Admin Already Exists");
			return;
		}
		const name = config.super_admin_name;
		const email = config.super_admin_email;
		const password = config.super_admin_password;

		if (!name || !email || !password) {
			throw new Error("Super Admin Name,Email,Password Missing In Env File");
		}
		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);
		const superAdmin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: Role.SUPER_ADMIN,
				needPasswordChange: false,
				emailVerified: true,
			},
		});
		console.log("Super Admin Created");
	} catch (error) {
		console.log("Error Seeding Super Admin: ", error);
		await prisma.user.delete({
			where: {
				email: config.super_admin_email,
			},
		});
	}
};
export const seedTestAdmin = async () => {
	try {
		const isTestAdminExists = await prisma.user.findFirst({
			where: {
				role: Role.ADMIN,
			},
		});
		if (isTestAdminExists) {
			console.log("Test Admin Already Exists");
			return;
		}
		const name = config.test_admin_name;
		const email = config.test_admin_email;
		const password = config.test_admin_password;

		if (!name || !email || !password) {
			throw new Error("Test Admin Name,Email,Password Missing In Env File");
		}
		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);
		const testAdmin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: Role.ADMIN,
				needPasswordChange: false,
				emailVerified: true,
			},
		});
		console.log("Test Admin Created");
	} catch (error) {
		console.log("Error Seeding Test Admin: ", error);
		await prisma.user.delete({
			where: {
				email: config.test_admin_email,
			},
		});
	}
};
export const seedTestDoctor = async () => {
	try {
		const isTestDoctorExists = await prisma.user.findFirst({
			where: {
				role: Role.DOCTOR,
			},
		});
		if (isTestDoctorExists) {
			console.log("Test Doctor Already Exists");
			return;
		}
		const name = config.test_doctor_name;
		const email = config.test_doctor_email;
		const password = config.test_doctor_password;

		if (!name || !email || !password) {
			throw new Error("Test Doctor Name,Email,Password Missing In Env File");
		}
		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);
		const testDoctor = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: Role.DOCTOR,
				needPasswordChange: false,
				emailVerified: true,
			},
		});
		console.log("Test Doctor Created");
	} catch (error) {
		console.log("Error Seeding Test Doctor: ", error);
		await prisma.user.delete({
			where: {
				email: config.test_doctor_email,
			},
		});
	}
};
