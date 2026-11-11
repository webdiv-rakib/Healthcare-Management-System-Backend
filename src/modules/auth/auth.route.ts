import { Router } from "express";
import { authController } from "./auth.controller";
import { auth } from "../../middlewares/auth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post('/register', authController.registerPatient);
router.post('/login', authController.loginUser);
router.get('/me', auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.PATIENT), authController.getMe);
router.post('/refresh-token', authController.refreshToken);

export const authRoutes = router;