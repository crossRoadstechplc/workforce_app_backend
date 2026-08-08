import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client.js";
const prisma=new PrismaClient();
const permissions=["employee.create","employee.view","employee.update","employee.deactivate","office.manage","schedule.manage","attendance.check_in","attendance.check_out","attendance.view_own","attendance.view_all","attendance.correct","worksheet.create","worksheet.view_own","worksheet.view_all","worksheet.review","leave.request","leave.view_own","leave.view_all","leave.approve","leave.reject","notification.view","report.view","report.export","audit.view"];
async function main(){
 await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis`);
 const admin=await prisma.role.upsert({where:{name:"ADMIN"},update:{},create:{name:"ADMIN",description:"System administrator"}});
 const employee=await prisma.role.upsert({where:{name:"EMPLOYEE"},update:{},create:{name:"EMPLOYEE",description:"Employee user"}});
 for(const code of permissions){ const p=await prisma.permission.upsert({where:{code},update:{},create:{code}}); await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:admin.id,permissionId:p.id}},update:{},create:{roleId:admin.id,permissionId:p.id}}); if(["attendance.check_in","attendance.check_out","attendance.view_own","worksheet.create","worksheet.view_own","leave.request","leave.view_own","notification.view"].includes(code)) await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:employee.id,permissionId:p.id}},update:{},create:{roleId:employee.id,permissionId:p.id}}); }
 const email=(process.env.INITIAL_ADMIN_EMAIL??"admin@example.com").toLowerCase(); const password=process.env.INITIAL_ADMIN_PASSWORD??"ChangeMe123!"; const passwordHash=await argon2.hash(password,{type:argon2.argon2id});
 const user=await prisma.user.upsert({where:{email},update:{},create:{email,passwordHash,mustChangePassword:true}});
 await prisma.userRole.upsert({where:{userId_roleId:{userId:user.id,roleId:admin.id}},update:{},create:{userId:user.id,roleId:admin.id}});
 for (const name of ["Annual Leave","Sick Leave","Emergency Leave","Unpaid Leave","Other Leave"]) {
   await prisma.leaveType.upsert({where:{name},update:{isActive:true},create:{name,isActive:true}});
 }
 console.log(`Seeded admin: ${email}`);
}
main().finally(()=>prisma.$disconnect());
