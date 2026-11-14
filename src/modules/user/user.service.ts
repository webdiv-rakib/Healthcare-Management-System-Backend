import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const uploadProfileImage = async (buffer: Buffer,userId:string) => {
	cloudinary.uploader
		.upload_stream(
			{
				resource_type: "auto",
			},
			(error, result) => {
				if (error) {
					console.log(error);
					throw new Error(error.message);
				}
				console.log(result);
				// return result;
                const updatedUser = await prisma.user.update({
                    where:{
                        id:userid
                    },
                    data:{
                        
                    }
                })
			},
		)
		.end(buffer);
};

export const userService = {
	uploadProfileImage,
};
