/** biome-ignore-all lint/style/useConst: <explanation> */
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import type {
	IForgotPassword,
	IGoogleLoginPayload,
	ILoginUserPayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPassword,
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

const registerPatient = async (payload: IRegisterPatientPayload) => {
	const { name, password, patient: patientData } = payload;
	const email = payload.email.trim().toLowerCase();
	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new Error("User with this email already exists");
	}

	const hashedPassword = await bcrypt.hash(
		password,
		Number(config.bcrypt_salt_rounds),
	);

	const createdUser = await prisma.user.create({
		data: {
			name,
			email,
			password: hashedPassword,
			role: Role.PATIENT,
			status: UserStatus.ACTIVE,
			emailVerified: false,
			patient: {
				create: {
					name,
					email,
					contactNumber: patientData?.contactNumber || "",
				},
			},
		},
		omit: { password: true },
		include: { patient: true },
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
		throw new Error("User not found");
	}
	if (user.status === UserStatus.BLOCKED) {
		throw new Error("User is blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new Error("user is deleted");
	}
	if (user.password === null && user.googleId !== null) {
		throw new Error(
			"User Already has account registered with Google.Try to login with Google",
		);
	}

	const isPasswordMatched = await bcrypt.compare(
		password,
		user.password as string,
	);
	if (!isPasswordMatched) {
		throw new Error("Invalid credentials");
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
		throw new Error("User not found");
	}
	return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new Error(
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
		throw new Error("User is inactive or not found");
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
		throw new Error("Invalid Or Expired Google Id Token");
	}

	if (!googleIdTokenPayload) {
		throw new Error("Invalid Or Expired Google Id Token");
	}

	if (!googleIdTokenPayload.email) {
		throw new Error("Google Email Not Found");
	}
	if (!googleIdTokenPayload.name) {
		throw new Error("Google Email User Name Not Found");
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
				throw new Error("Email Not Verified");
			}
			if (ifPaitentExistsWithCredentials.status === UserStatus.BLOCKED) {
				throw new Error("User is Blocked");
			}
			if (
				ifPaitentExistsWithCredentials.isDeleted ||
				ifPaitentExistsWithCredentials.status === UserStatus.DELETED
			) {
				throw new Error("User is Deleted");
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
		}
	}

	if (!user) {
		throw new Error("User not found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new Error("User is Blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new Error("User is Deleted");
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
		throw new Error("No User Found With this email");
	}
	if (isUserExist.status === "BLOCKED") {
		throw new Error("This use is blocked");
	}
	if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
		throw new Error("User is deleted");
	}
	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new Error("Use has accoutn with google");
	}
	if (!isUserExist.emailVerified) {
		throw new Error("User not verified");
	}
	const otp = crypto.randomInt(100000, 1000000).toString();
	const key = `forgot-password-otp:${isUserExist.email}`;
	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: 5 * 60,
		},
	});
	await transporter.sendMail({
		from: config.smtp_sender,
		to: isUserExist.email,
		subject: "Forgot Password",
		// text: `Your OTP is ${otp}`,
		html: `<h1>Your OTP is ${otp}</h1>`,
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
		throw new Error("No User Found With this email");
	}
	if (isUserExist.status === "BLOCKED") {
		throw new Error("This use is blocked");
	}
	if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
		throw new Error("User is deleted");
	}
	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new Error("Use has accoutn with google");
	}
	if (!isUserExist.emailVerified) {
		throw new Error("User not verified");
	}

	const key = `forgot-password-otp:${isUserExist.email}`;
	const redisOtp = await redisClient.get(key);
	if (!redisOtp) {
		throw new Error("Invalid OTP");
	}
	if (redisOtp !== otp) {
		throw new Error("OTP Does Not Matched");
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

	await transporter.sendMail({
		from: config.smtp_sender,
		to: isUserExist.email,
		subject: "Password Changed",
		// text: `Your OTP is ${otp}`,
		html: `<h1>Your Password Is Changed</h1>`,
	});
};

export const authService = {
	registerPatient,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	forgotPassword,
	resetPassword,
};
