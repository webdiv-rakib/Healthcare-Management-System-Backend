import cron from 'node-cron';

export const deleteUnverifiedDoctors = async () => {
    cron.schedule('*/2 * * * * *', () => {
        //prisma business logic
        console.log("doctor delete")
    });
}