import config from "../../config";
import { prisma } from "../../lib/prisma";
import {
	AppointmentStatus,
	PaymentStatus,
} from "../../../generated/prisma/enums";
import type { RequestUser } from "../../middlewares/auth";
import { getBkashIdToken } from "../../lib/bkash";

const bookAppointment = async (payload: any, user: RequestUser) => {
	const appointment = await prisma.appointment.create({
		data: {
			status: AppointmentStatus.PENDING,
		},
	});

	try {
		const bkashIdTOken = await getBkashIdToken();
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
					payerReference: user.email || "01700000000",
					callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
					amount: "1200",
					currency: "BDT",
					intent: "sale",
					merchantInvoiceNumber: appointment.id,
					subMerchantName: "Test",
					merchantAssociationInfo: "MI05MID54RF09123456789",
				}),
			},
		);

		const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

		// CHANGE 1 (ROOT CAUSE FIX): bKash v2 returns `paymentId` (lowercase 'd') in the JSON body.
		// Support both `paymentId` and `paymentID` so it never resolves to undefined.
		const createdPaymentId =
			bkashCreatePaymentResult?.paymentId ||
			bkashCreatePaymentResult?.paymentID;

		// CHANGE 2: Check `createdPaymentId` and `bkashURL` instead of uppercase `paymentID`
		if (
			!bkashCreatePaymentResponse.ok ||
			!createdPaymentId ||
			!bkashCreatePaymentResult?.bkashURL
		) {
			console.error(
				"bKash Create Payment Error Response:",
				bkashCreatePaymentResult,
			);
			throw new Error(
				`bKash Error (${bkashCreatePaymentResult?.statusCode || bkashCreatePaymentResponse.status}): ${
					bkashCreatePaymentResult?.statusMessage ||
					bkashCreatePaymentResult?.message ||
					JSON.stringify(bkashCreatePaymentResult)
				}`,
			);
		}

		// CHANGE 3: Save `createdPaymentId` (`TR0011...`) into `bkashPaymentId` so the callback finds it!
		await prisma.payment.create({
			data: {
				merchantInvoiceNumber:
					bkashCreatePaymentResult.merchantInvoiceNumber || appointment.id,
				appointmentId: appointment.id,
				amount: "1200",
				gatewayResponse: bkashCreatePaymentResult,
				bkashPaymentId: createdPaymentId,
				payerReference: user.email,
			},
		});

		return {
			paymentUrl: bkashCreatePaymentResult.bkashURL,
		};
	} catch (error) {
		await prisma.appointment.delete({
			where: { id: appointment.id },
		});
		throw error;
	}
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	// CHANGE 4: Callback URL query uses `paymentID` (uppercase), support both just in case
	const paymentId = (query.paymentID || query.paymentId) as string;
	if (!paymentId) {
		throw new Error("Payment ID is missing");
	}

	const status = query.status as string;
	if (!status) {
		throw new Error("Payment status is missing");
	}

	const existingPayment = await prisma.payment.findUnique({
		where: {
			bkashPaymentId: paymentId,
		},
	});

	if (!existingPayment) {
		throw new Error(`Payment record not found for paymentID: ${paymentId}`);
	}

	if (status === "failure") {
		await prisma.payment.update({
			where: { id: existingPayment.id },
			data: {
				status: PaymentStatus.FAILED,
				gatewayResponse: query,
			},
		});
		return {
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
		};
	}

	if (status === "cancel") {
		await prisma.payment.update({
			where: { id: existingPayment.id },
			data: {
				status: PaymentStatus.CANCELLED,
				gatewayResponse: query,
			},
		});
		return {
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
		};
	}

	if (status === "success") {
		const bkashIdToken = await getBkashIdToken();
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
					// CHANGE 5: Your original code actually had the right key (`paymentId`) for bKash v2!
					paymentId: paymentId,
				}),
			},
		);

		const executedPaymentResult = await executedPaymentResponse.json();

		// CHANGE 6: bKash v2 execute response returns `transactionStatus === "Completed"`
		// (and may not include `statusCode: "0000"` like v1), so check `transactionStatus === "Completed"`
		if (
			executedPaymentResponse.ok &&
			executedPaymentResult?.transactionStatus === "Completed"
		) {
			await prisma.$transaction(async (tx) => {
				await tx.appointment.update({
					where: {
						id:
							executedPaymentResult.merchantInvoiceNumber ||
							existingPayment.appointmentId,
					},
					data: {
						status: AppointmentStatus.CONFIRMED,
					},
				});

				await tx.payment.update({
					where: {
						id: existingPayment.id,
					},
					data: {
						status: PaymentStatus.PAID,
						bkashTrxId:
							executedPaymentResult.trxId || executedPaymentResult.trxID,
						paidAt: executedPaymentResult.paymentExecuteTime,
						gatewayResponse: executedPaymentResult,
					},
				});
			});

			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
			};
		}

		console.error(
			"bKash Execute Payment Error Response:",
			executedPaymentResult,
		);

		await prisma.payment.update({
			where: { id: existingPayment.id },
			data: {
				status: PaymentStatus.FAILED,
				gatewayResponse: executedPaymentResult,
			},
		});

		return {
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
		};
	}

	return {
		redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
	};
};

export const appointmentService = {
	bookAppointment,
	bookAppointmentCallback,
};
