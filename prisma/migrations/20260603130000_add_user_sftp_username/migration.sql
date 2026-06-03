ALTER TABLE "User" ADD COLUMN "sftpUsername" TEXT;
CREATE UNIQUE INDEX "User_sftpUsername_key" ON "User"("sftpUsername");

