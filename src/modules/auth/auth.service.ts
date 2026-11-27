/** biome-ignore-all lint/style/useConst: <explanation> */
import httpStatus from "http-status";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import type {
	IForgotPassword,
	IGoogleLoginPayload,
	ILoginUserPayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPassword,
	IVerifyEmailPayload,
} from "./auth.interface";
import config from "../../config";
import {
	AuthProvider,
	Role,
	UserStatus,
} from "../../../generated/prisma/enums";
import { jwtUtils } from "../../utils/jwt";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import { googleClient } from "../../lib/googleAuth";
import type { TokenPayload } from "google-auth-library";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import path from "path";
import { AppError } from "../../utils/AppError";

const registerPatient = async (payload: IRegisterPatientPayload) => {
	const { name, password, patient: patientData } = payload;
	const email = payload.email.trim().toLowerCase();
	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new AppError(
			httpStatus.CONFLICT,
			"User with this email already exists",
		);
	}

	const hashedPassword = await bcrypt.hash(
		password,
		Number(config.bcrypt_salt_rounds),
	);

	const expirationSeconds = 5 * 60;
	const otpKey = `patient-registration-otp:${email}`;
	const otpValue = crypto.randomInt(100000, 1000000).toString();
	await redisClient.set(otpKey, otpValue, {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});
	const patientRegistrationKey = `patient-registration-data:${email}`;
	const redisUserDataPayload = {
		name,
		email,
		password: hashedPassword,
		patient: patientData,
	};
	await redisClient.set(
		patientRegistrationKey,
		JSON.stringify(redisUserDataPayload),
		{
			expiration: {
				type: "EX",
				value: expirationSeconds,
			},
		},
	);

	const templatePath = path.join(
		process.cwd(),
		"src/templates/registration-user-otp.ejs",
	);

	const templateData = {
		name,
		email,
		otp: otpValue,
		expirationMinutes: expirationSeconds / 60,
	};
	const html = await ejs.renderFile(templatePath, templateData);
	await transporter.sendMail({
		from: config.smtp_sender,
		to: email,
		subject: "Email Verification",
		// text: `Your OTP is ${otp}`,
		// html: `<h1>Your OTP is ${otp}</h1>`,
		html,
	});
};

const verifyPatientEmail = async (payload: IVerifyEmailPayload) => {
	const otp = payload.otp;
	const email = payload.email.trim().toLowerCase();
	const isUserExist = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExist?.status === "BLOCKED") {
		throw new AppError(httpStatus.FORBIDDEN, "This use is blocked");
	}
	if (isUserExist?.emailVerified) {
		throw new AppError(httpStatus.CONFLICT, "Email Already Verified");
	}
	if (isUserExist?.isDeleted || isUserExist?.status === "DELETED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
	}
	if (isUserExist?.googleId && isUserExist?.authProvider === "GOOGLE") {
		throw new AppError(httpStatus.BAD_REQUEST, "Use has account with google");
	}

	const otpKey = `patient-registration-otp:${email}`;
	const redisOtp = await redisClient.get(otpKey);
	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}
	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Matched");
	}
	await redisClient.del(otpKey);

	const patientRegistrationKey = `patient-registration-data:${email}`;
	const redisPatientData = await redisClient.get(patientRegistrationKey);
	if (!redisPatientData) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Does not Exist");
	}
	const patientPayload: IRegisterPatientPayload = JSON.parse(redisPatientData);

	const createdUser = await prisma.user.create({
		data: {
			name: patientPayload.name,
			email: patientPayload.email,
			password: patientPayload.password,
			role: Role.PATIENT,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			patient: {
				create: {
					name: patientPayload.name,
					email: patientPayload.email,
					contactNumber: patientPayload?.patient?.contactNumber || "",
				},
			},
		},
		omit: { password: true },
		include: { patient: true },
	});

	await redisClient.del(patientRegistrationKey);

	const templatePath = path.join(
		process.cwd(),
		"src/templates/patient-welcome-email.ejs",
	);

	const templateData = {
		name: createdUser.name,
	};
	const html = await ejs.renderFile(templatePath, templateData);
	await transporter.sendMail({
		from: config.smtp_sender,
		to: email,
		subject: "Welcome to Healthcare System",
		// text: `Your OTP is ${otp}`,
		// html: `<h1>Your OTP is ${otp}</h1>`,
		html,
	});

	const { patient, ...user } = createdUser;
	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);
	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		user,
		patient,
		accessToken,
		refreshToken,
	};
};

const loginUser = async (payload: ILoginUserPayload) => {
	const { password } = payload;
	const email = payload.email.trim().toLowerCase();
	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
	}
	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "user is deleted");
	}
	if (user.password === null && user.googleId !== null) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"User Already has account registered with Google.Try to login with Google",
		);
	}

	const isPasswordMatched = await bcrypt.compare(
		password,
		user.password as string,
	);
	if (!isPasswordMatched) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid credentials");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);
	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const getMe = async (user: IRequestUser) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			id: user.userId,
		},
		include: {
			patient: true,
		},
		omit: {
			password: true,
		},
	});
	if (!isUserExists) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}
	return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			config.node_env === "development"
				? verifiedRefreshToken.error
				: "Invalid refresh token",
		);
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id: data.userId },
	});

	if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"User is inactive or not found",
		);
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
	let googleIdTokenPayload: TokenPayload | null | undefined = null;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});
		googleIdTokenPayload = ticket.getPayload();
	} catch (error) {
		console.log("Goolge ID Token verification", error);
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid Or Expired Google Id Token",
		);
	}

	if (!googleIdTokenPayload) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid Or Expired Google Id Token",
		);
	}

	if (!googleIdTokenPayload.email) {
		throw new AppError(httpStatus.BAD_REQUEST, "Google Email Not Found");
	}
	if (!googleIdTokenPayload.name) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Google Email User Name Not Found",
		);
	}

	const ifPatientExistsWithGooleAuth = await prisma.user.findUnique({
		where: {
			email: googleIdTokenPayload.email,
			role: Role.PATIENT,
			googleId: googleIdTokenPayload.sub,
		},
	});

	let user = ifPatientExistsWithGooleAuth;

	if (!ifPatientExistsWithGooleAuth) {
		const ifPaitentExistsWithCredentials = await prisma.user.findUnique({
			where: {
				email: googleIdTokenPayload.email,
				role: Role.PATIENT,
				authProvider: AuthProvider.CREDENTIAL,
			},
		});

		if (ifPaitentExistsWithCredentials) {
			if (!ifPaitentExistsWithCredentials.emailVerified) {
				throw new AppError(httpStatus.FORBIDDEN, "Email Not Verified");
			}
			if (ifPaitentExistsWithCredentials.status === UserStatus.BLOCKED) {
				throw new AppError(httpStatus.FORBIDDEN, "User is Blocked");
			}
			if (
				ifPaitentExistsWithCredentials.isDeleted ||
				ifPaitentExistsWithCredentials.status === UserStatus.DELETED
			) {
				throw new AppError(httpStatus.FORBIDDEN, "User is Deleted");
			}
			user = await prisma.user.update({
				where: {
					id: ifPaitentExistsWithCredentials.id,
				},
				data: {
					googleId: googleIdTokenPayload.sub,
				},
			});
		} else {
			// Goole Register.
			user = await prisma.user.create({
				data: {
					name: googleIdTokenPayload.name,
					email: googleIdTokenPayload.email,
					role: Role.PATIENT,
					googleId: googleIdTokenPayload.sub,
					authProvider: AuthProvider.GOOGLE,
					emailVerified: true,
					patient: {
						create: {
							name: googleIdTokenPayload.name,
							email: googleIdTokenPayload.email,
						},
					},
				},
			});
			const templatePath = path.join(
				process.cwd(),
				"src/templates/patient-welcome-email.ejs",
			);

			const templateData = {
				name: user.name,
			};
			const html = await ejs.renderFile(templatePath, templateData);
			await transporter.sendMail({
				from: config.smtp_sender,
				to: user.email,
				subject: "Welcome to Healthcare System",
				// text: `Your OTP is ${otp}`,
				// html: `<h1>Your OTP is ${otp}</h1>`,
				html,
			});
		}
	}

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is Blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is Deleted");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);
	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const forgotPassword = async (payload: IForgotPassword) => {
	const { email } = payload;
	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});
	if (!isUserExist) {
		throw new AppError(httpStatus.NOT_FOUND, "No User Found With this email");
	}
	if (isUserExist.status === "BLOCKED") {
		throw new AppError(httpStatus.FORBIDDEN, "This use is blocked");
	}
	if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
	}
	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new AppError(httpStatus.BAD_REQUEST, "Use has accoutn with google");
	}
	if (!isUserExist.emailVerified) {
		throw new AppError(httpStatus.FORBIDDEN, "User not verified");
	}
	const otp = crypto.randomInt(100000, 1000000).toString();
	const key = `forgot-password-otp:${isUserExist.email}`;
	const expirationSeconds = 5 * 60;
	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});

	const templatePath = path.join(
		process.cwd(),
		"src/templates/forgot-password.ejs",
	);

	const templateData = {
		name: isUserExist.name,
		otp,
		expirationMinutes: expirationSeconds / 60,
	};
	const html = await ejs.renderFile(templatePath, templateData);
	await transporter.sendMail({
		from: config.smtp_sender,
		to: isUserExist.email,
		subject: "Forgot Password",
		// text: `Your OTP is ${otp}`,
		// html: `<h1>Your OTP is ${otp}</h1>`,
		html,
	});
};

const resetPassword = async (payload: IResetPassword) => {
	const { email, otp, newPassword } = payload;
	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});
	if (!isUserExist) {
		throw new AppError(httpStatus.NOT_FOUND, "No User Found With this email");
	}
	if (isUserExist.status === "BLOCKED") {
		throw new AppError(httpStatus.FORBIDDEN, "This use is blocked");
	}
	if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
	}
	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new AppError(httpStatus.BAD_REQUEST, "Use has accoutn with google");
	}
	if (!isUserExist.emailVerified) {
		throw new AppError(httpStatus.FORBIDDEN, "User not verified");
	}

	const key = `forgot-password-otp:${isUserExist.email}`;
	const redisOtp = await redisClient.get(key);
	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}
	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Matched");
	}
	const hashedNewPassword = await bcrypt.hash(
		newPassword,
		Number(config.bcrypt_salt_rounds),
	);
	await prisma.user.update({
		where: {
			email: isUserExist.email,
		},
		data: {
			password: hashedNewPassword,
		},
	});
	await redisClient.del([key]);

	const templatePath = path.join(
		process.cwd(),
		"src/templates/reset-password-success.ejs",
	);

	const templateData = {
		name: isUserExist.name,
	};
	const html = await ejs.renderFile(templatePath, templateData);

	await transporter.sendMail({
		from: config.smtp_sender,
		to: isUserExist.email,
		subject: "Password Changed",
		// text: `Your OTP is ${otp}`,
		// html: `<h1>Your Password Is Changed</h1>`,
		html,
	});
};

// tomorrow is my first interview with me good luck.

export const authService = {
	registerPatient,
	verifyPatientEmail,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	forgotPassword,
	resetPassword,
};
