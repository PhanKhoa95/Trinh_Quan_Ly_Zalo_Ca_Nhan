const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking Member count ===');
  const members = await prisma.member.findMany();
  console.log(`Total members: ${members.length}`);
  
  // Group members by groupId
  const membersByGroup = {};
  for (const member of members) {
    if (!membersByGroup[member.groupId]) {
      membersByGroup[member.groupId] = [];
    }
    membersByGroup[member.groupId].push(member);
  }

  for (const [groupId, list] of Object.entries(membersByGroup)) {
    console.log(`\nGroup ID: ${groupId} (${list.length} members):`);
    list.forEach(m => {
      console.log(`  - ID: ${m.zaloId}, Name: ${m.name}, xungHo: ${m.xungHo}, avatar: ${m.avatar ? (m.avatar.substring(0, 40) + '...') : null}`);
    });
  }

  console.log('\n=== Checking MemberMemory count ===');
  const memories = await prisma.memberMemory.findMany({
    include: {
      member: true
    }
  });
  console.log(`Total memories: ${memories.length}`);
  memories.forEach(mem => {
    console.log(`  - Group: ${mem.groupId}, User: ${mem.member?.name || mem.zaloId}, Fact: "${mem.fact}", Importance: ${mem.importance}`);
  });

  console.log('\n=== Checking Messages count ===');
  const msgCount = await prisma.message.count();
  console.log(`Total messages in DB: ${msgCount}`);
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
