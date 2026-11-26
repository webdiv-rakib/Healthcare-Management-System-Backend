import type { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import { Role } from "../../../generated/prisma/enums";
import crypto from "crypto"
import { redisClient } from "../../lib/redis";
import path from "path"
import ejs from "ejs"
import { transporter } from "../../lib/nodemailer";
import { ICreateDoctorPayload, IVerifyDoctorEmailPayload } from "./doctor.interface";

const applyDoctor = async (
	payload: ICreateDoctorPayload,
	resume: Express.Multer.File | null,
	additionalFiles: Express.Multer.File[],
) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			email: payload.user.email,
		},
	});
	if (isUserExists) {
		throw new Error("User Already Exists With This Email");
	}

	const resumeResult = await new Promise<UploadApiResponse>(
		(resolve, reject) => {
			cloudinary.uploader
				.upload_stream(
					{
						resource_type: "auto",
					},

					async (error, result) => {
						if (error) {
							return reject(error);
						}

						if (!result) {
							return reject(new Error("No result returned from Cloudinary"));
						}

						resolve(result);
					},
				)
				.end(resume?.buffer);
		},
	);
	const additionalFilesUploadResults = await Promise.all(
		additionalFiles.map((file) => {
			return new Promise<UploadApiResponse>((resolve, reject) => {
				cloudinary.uploader
					.upload_stream(
						{
							resource_type: "auto",
						},

						async (error, result) => {
							if (error) {
								return reject(error);
							}

							if (!result) {
								return reject(new Error("No result returned from Cloudinary"));
							}

							resolve(result);
						},
					)
					.end(file.buffer);
			});
		}),
	);
	const randomDoctorPassword = Math.random().toString(36).slice(-8);

	const hashedPassword = await bcrypt.hash(
		randomDoctorPassword,
		Number(config.bcrypt_salt_rounds),
	);

	const doctorApplication = await prisma.user.create({
		data: {
			...payload.user,
			password: hashedPassword,
			role: Role.DOCTOR,
			needPasswordChange: true,
			doctor: {
				create: {
					...payload.doctor,
					name: payload.user.name,
					email: payload.user.email,
					resume: resumeResult.secure_url,
					resumePublicId: resumeResult.public_id,
					additionalFiles: additionalFilesUploadResults.map((file) => ({
						url: file.secure_url,
						publicId: file.public_id,
					})),
				},
			},
		},
		include: {
			doctor: true,
		},
	});

	const expirationSeconds = 60 * 60 // 1hour
	const otpKey = `doctor-application-otp:${payload.user.email}`
	const otpValue = crypto.randomInt(100000, 1000000).toString();
	await redisClient.set(otpKey, otpValue, {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});
	const templatePath = path.join(
		process.cwd(),
		"src/templates/registration-user-otp.ejs",
	);
	const templateData = {
		name: payload.user.name,
		email: payload.user.email,
		otp: otpValue,
		expirationMinutes: expirationSeconds / 60,
	};
	const html = await ejs.renderFile(templatePath, templateData);
	await transporter.sendMail({
		from: config.smtp_sender,
		to: payload.user.email,
		subject: "Email Verification",
		html,
	});

	return doctorApplication;
};

const verifyDoctorEmail = async (payload: IVerifyDoctorEmailPayload) => {
	const otp = payload.otp
	const email = payload.email.trim().toLowerCase();
	const existingUser = await prisma.user.findUnique({
		where: { email, role: Role.DOCTOR }
	});
	if (!existingUser) {
		throw new Error("Doctor Application Not Found. Please Apply Again.");
	};
	if (existingUser.emailVerified) {
		throw new Error("Email Already Verified")
	}
	const otpKey = `doctor-application-otp:${email}`;
	const redisOtp = await redisClient.get(otpKey);
	if (!redisOtp) {
		throw new Error("OTP Expired. Your Application window has closed, please apply again")
	};
	if (redisOtp !== otp) {
		throw new Error("OTP Does not matched")
	};
	await redisClient.del(otpKey);
	const verifyUser = await prisma.user.update({
		where: { id: existingUser.id },
		data: { emailVerified: true },
		omit: { password: true },
		include: { doctor: true }
	});
	return verifyUser
}

export const DoctorService = {
	applyDoctor,
	verifyDoctorEmail
};
