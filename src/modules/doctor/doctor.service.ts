import type { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import config from "../../config";
import { DoctorVerificationsStatus, Role } from "../../../generated/prisma/enums";
import crypto from "crypto"
import { redisClient } from "../../lib/redis";
import path from "path"
import ejs from "ejs"
import { transporter } from "../../lib/nodemailer";
import { IApproveDoctorPayload, ICreateDoctorPayload, IVerifyDoctorEmailPayload } from "./doctor.interface";
import { RequestUser } from "../../middlewares/auth";
import { IQuery } from "../../interfaces";
import { DoctorWhereInput } from "../../../generated/prisma/models";

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
};

const approveDoctor = async (payload: IApproveDoctorPayload, reviewer: RequestUser) => {
	const { doctorId, verificationStatus, rejectionReason } = payload;
	const existingDoctor = await prisma.doctor.findUnique({
		where: { id: doctorId },
		include: { user: true },
	});
	if (!existingDoctor) {
		throw new Error("Doctor Application Not Found");
	}

	if (existingDoctor.isDeleted) {
		throw new Error("Doctor Application Has Been Deleted");
	}

	if (!existingDoctor.user.emailVerified) {
		throw new Error(
			"Doctor Has Not Verified Their Email Yet. Application Cannot Be Reviewed.",
		);
	}
	if (existingDoctor.verificationStatus !== DoctorVerificationsStatus.PENDING) {
		throw new Error(`Doctor Application Has Already Been ${existingDoctor.verificationStatus.toLowerCase()}`,
		);
	}

	if (
		verificationStatus === DoctorVerificationsStatus.REJECTED &&
		!rejectionReason
	) {
		throw new Error(
			"Rejection Reason Is Required When Rejecting A Doctor Application",
		);
	};

	const updatedDoctor = await prisma.doctor.update({
		where: { id: doctorId },
		data: {
			verificationStatus,
			rejectionReason:
				verificationStatus === DoctorVerificationsStatus.REJECTED
					? rejectionReason
					: null,
			reviewedBy: reviewer.userId,
			reviewedAt: new Date(),
		},
	});

	const isApproved = verificationStatus === DoctorVerificationsStatus.APPROVED;

	const tempatePath = path.join(
		process.cwd(),
		`src/app/templates/${isApproved
			? "doctor-application-approved.ejs"
			: "doctor-application-rejected.ejs"
		}`,
	);

	const templateData = {
		name: updatedDoctor.name,
		reason: updatedDoctor.rejectionReason,
	};

	const html = await ejs.renderFile(tempatePath, templateData);
	await transporter.sendMail({
		from: config.smtp_sender,
		to: updatedDoctor.email,
		subject: isApproved
			? "Your Doctor Application Has Been Approved"
			: "Your Doctor Application Has Been Rejected",
		html,
	});

	return updatedDoctor
};

const getAllDoctors = async (query: IQuery) => {
	// search, filter, sorting, pagination.
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc"
	const andConditions: DoctorWhereInput[] = []

	//Searching
	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ email: { contains: query.searchTerm, mode: "insensitive" } },
				{
					specialization: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
				{
					licenseNumber: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
			],
		});
	}

	//filtering
	if (query.specialization) {
		andConditions.push({
			specialization: { equals: query.specialization, mode: "insensitive" },
		});
	}

	if (query.email) {
		andConditions.push({
			email: { contains: query.email, mode: "insensitive" },
		});
	}

	if (query.licenseNumber) {
		andConditions.push({
			licenseNumber: { equals: query.licenseNumber, mode: "insensitive" },
		});
	}

	if (query.verificationStatus) {
		andConditions.push({
			verificationStatus: query.verificationStatus as DoctorVerificationsStatus,
		});
	}

	andConditions.push({ isDeleted: false });

	const allDoctors = await prisma.doctor.findMany({
		where: {
			AND: andConditions
		},
		take: limit,
		skip: skip,


		orderBy: {
			// sortBy : sortOrder
			[sortBy]: sortOrder
		},
		include: {
			user: {
				omit: {
					password: true
				}
			},

			// schedules: true,
			// appointments: true
			// prescriptions: true
		}
	});
	const totalDoctorCount = await prisma.doctor.count({
		where: {
			AND: andConditions
		}
	});

	return {
		data: allDoctors,
		meta: {
			page: page,
			limit: limit,
			total: totalDoctorCount,
			totalPages: Math.ceil(totalDoctorCount / limit)
		}
	}
}

export const DoctorService = {
	applyDoctor,
	verifyDoctorEmail,
	approveDoctor,
	getAllDoctors
};
