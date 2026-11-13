import { Router } from "express";
import { authController } from "./auth.controller";
import { auth } from "../../middlewares/auth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middlewares/validateRequest";
import { authValidation } from "./auth.validation";

const router = Router();

router.post(
	"/register",
	validateRequest(authValidation.PatientRegistrationZodSchema),
	authController.registerPatient,
);
router.post(
	"/login",
	validateRequest(authValidation.loginZodSchema),
	authController.loginUser,
);
router.get(
	"/me",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.PATIENT),
	authController.getMe,
);
router.post("/refresh-token", authController.refreshToken);
router.post("/google-login", authController.googleLogin);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

export const authRoutes = router;
