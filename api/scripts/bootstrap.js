require('dotenv').config();
const bcrypt=require('bcryptjs');
const {sequelize,User,Role,Audit}=require('../models');
const {z}=require('../validators');
async function main(){
 const email=z.string().email().parse(process.env.BOOTSTRAP_EMAIL);
 const password=z.string().min(12).max(128).parse(process.env.BOOTSTRAP_PASSWORD);
 await sequelize.transaction(async transaction=>{
  if(await User.count({transaction}))throw new Error('Bootstrap is only available before the first user exists. Use user management afterward.');
  const role=await Role.findOne({where:{name:'Admin'},transaction});if(!role)throw new Error('Run migrations first.');
  const user=await User.create({name:process.env.BOOTSTRAP_NAME||'Viva Administrator',email:email.toLowerCase(),passwordHash:await bcrypt.hash(password,12)},{transaction});
  await user.addRole(role,{transaction});
  await Audit.create({userId:user.id,action:'bootstrap',module:'users',recordId:user.id,newData:{email:user.email}},{transaction});
 });console.log('Administrator created. Remove BOOTSTRAP_PASSWORD from the environment.');
}
main().catch(e=>{console.error(e.name==='ZodError'?'Set a valid BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD (12+ characters).':e.message);process.exitCode=1;}).finally(()=>sequelize.close());
