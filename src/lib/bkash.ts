import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdTOken = async () => {
	try {
		const IdTokenKey = "bkash:idToken";
		const RefreshTokenKey = "bkash:refreshToken";

		let bkashIdToken = await redisClient.get(IdTokenKey);
		const bkashIdTTL = await redisClient.ttl(IdTokenKey);
		const bkashRefreshToken = await redisClient.get(RefreshTokenKey);
		const bkashRefreshTokenTTL = await redisClient.ttl(RefreshTokenKey);

		// console.log({
		// 	bkashIdToken,
		// 	bkashIdTTL,
		// 	bkashRefreshToken,
		// 	bkashRefreshTokenTTL,
		// });

		// bkash if tokien remaining time less than equal 10 minutes or bkashIdToken is Expries
		// bkash refresh token must exist
		// bkash refresh token remaining time is more than 10minutes
		if (
			(bkashIdTTL <= 600 || !bkashIdToken) &&
			bkashRefreshToken &&
			bkashRefreshTokenTTL > 600
		) {
			const refreshTokenResponse = await fetch(
				`${config.bkash_base_url}/tokenized-checkout/auth/refresh-token`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						username: config.bkash_username,
						password: config.bkash_password,
					},
					body: JSON.stringify({
						app_key: config.bkash_app_key,
						app_secret: config.bkash_app_secret,
						refresh_token: bkashRefreshToken,
					}),
				},
			);
			if (!refreshTokenResponse.ok) {
				throw new Error("Bkash Access Token Grand Failed");
			}
			const bkashRefreshTokenResult = await refreshTokenResponse.json();
			bkashIdToken = bkashRefreshTokenResult.id_token as string;
			await redisClient.set(IdTokenKey, bkashIdToken, {
				expiration: {
					type: "EX",
					value: 60 * 60,
				},
			});
			return bkashIdToken;
		}

		if (bkashRefreshTokenTTL > 600) {
			return bkashIdToken;
		}

		const resporse = await fetch(
			`${config.bkash_base_url}/tokenized-checkout/auth/grant-token`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					username: config.bkash_username,
					password: config.bkash_password,
				},
				body: JSON.stringify({
					app_key: config.bkash_app_key,
					app_secret: config.bkash_app_secret,
				}),
			},
		);

		if (!resporse.ok) {
			throw new Error("Bkash Access Token Grand Failed");
		}
		const result = await resporse.json();
		// bkash id token set
		await redisClient.set(IdTokenKey, result.id_token, {
			expiration: {
				type: "EX",
				value: 60 * 60, // 1hour
			},
		});

		// bkash refreshToken set
		await redisClient.set(RefreshTokenKey, result.refresh_token, {
			expiration: {
				type: "EX",
				value: 60 * 60 * 24 * 28, // 28days
			},
		});

		bkashIdToken = result.id_token;

		return bkashIdToken;
	} catch (error: any) {
		throw new Error(error.message);
	}
};
