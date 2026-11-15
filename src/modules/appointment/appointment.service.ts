import { getBkashIdTOken } from "./../../lib/bkash";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import {
	AppointmentStatus,
	PaymentStatus,
} from "../../../generated/prisma/enums";
import { RequestUser } from "../../middlewares/auth";

const bookAppointment = async (payload: any, user: RequestUser) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const appointment = await prisma.appointment.create({
			data: {
				status: AppointmentStatus.PENDING,
			},
		});

		const bkashIdTOken = await getBkashIdTOken();
		if (!bkashIdTOken) {
			throw new Error("No Bkash Access Token Found");
		}
		const bkashCreatePaymentResponse = await fetch(
			`${config.bkash_base_url}/tokenized-checkout/payment/create`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					Authorization: bkashIdTOken,
					"X-App-Key": config.bkash_app_key,
				},
				body: JSON.stringify({
					// payerReference: "TEST001ABC", // user email or phn number
					payerReference: user.email, // user email or phn number
					callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`, //
					amount: "1200",
					currency: "BDT",
					intent: "sale",
					// merchantInvoiceNumber: "test003", // apointment number
					merchantInvoiceNumber: appointment.id, // apointment number
					subMerchantName: "Test",
					merchantAssociationInfo: "MI05MID54RF09123456789",
				}),
			},
		);

		const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

		// payment model creation
		const payment = await tx.payment.create({
			data: {
				merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
				appointmentId: appointment.id,
				amount: "1200",
				gatewayResponse: bkashCreatePaymentResult,
				bkashPaymentId: bkashCreatePaymentResult.paymentID,
				payerReference: user.email,
			},
		});

		return bkashCreatePaymentResult.bkashURL;
	});
	return transactionResult;
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const paymentId = query.paymentID;
		if (!paymentId) {
			throw new Error("payment ID Missing");
		}
		const status = query.status;
		if (!status) {
			throw new Error("Payment Status is Missing");
		}

		const bkashIdToken = await getBkashIdTOken();

		if (!bkashIdToken) {
			throw new Error("No Bkash Access Token Found");
		}

		const executedPaymentResponse = await fetch(
			`${config.bkash_base_url}/tokenized-checkout/payment/execute`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					Authorization: bkashIdToken,
					"X-App-Key": config.bkash_app_key,
				},
				body: JSON.stringify({
					paymentId: paymentId,
				}),
			},
		);

		const executedPaymentResult = await executedPaymentResponse.json();

		if (status === "success") {
			await tx.appointment.update({
				where: {
					id: executedPaymentResult.merchantInvoiceNumber,
				},
				data: {
					status: AppointmentStatus.CONFIRMED,
				},
			});
			await tx.payment.update({
				where: {
					appointmentId: executedPaymentResult.merchantInvoiceNumber,
					bkashPaymentId: paymentId,
				},
				data: {
					status: PaymentStatus.PAID,
					bkashTrxId: executedPaymentResult.trxID,
					paidAt: executedPaymentResult.paymentExecuteTime,
					gatewayResponse: executedPaymentResult,
				},
			});
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
			};
		} else if (status === "failure") {
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentId,
				},
				data: {
					status: PaymentStatus.FAILED,
					gatewayResponse: executedPaymentResult,
				},
			});
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
			};
		} else if (status === "cancel") {
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentId,
				},
				data: {
					status: PaymentStatus.CANCELLED,
					gatewayResponse: executedPaymentResult,
				},
			});
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
			};
		} else {
			return {
				executedPaymentResult,
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
			};
		}
	});
	return transactionResult;
};

export const appointmentService = {
	bookAppointment,
	bookAppointmentCallback,
};
