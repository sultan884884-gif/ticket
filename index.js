const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits, InteractionType, ModalBuilder,
  TextInputBuilder, TextInputStyle, StringSelectMenuBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// ══════════════════════════════════════════
// تخزين الإعدادات في الذاكرة
// (للحفظ الدائم استخدم قاعدة بيانات)
// ══════════════════════════════════════════
let config = {
  panelChannel: null,      // قناة لوحة التيكتات
  logChannel: null,        // قناة اللوق
  supportRole: null,       // رتبة الدعم
  adminRole: null,         // رتبة الاداري (يغلق التيكت)
  ticketCategory: null,    // كاتيغوري التيكتات
  categories: [],          // أقسام التيكتات [{ id, name, emoji }]
  allowUserClose: false,   // هل صاحب التيكت يقدر يغلق؟
  ticketCounter: 0,
};

const openTickets = new Map(); // { channelId -> { userId, category, number } }

// ══════════════════════════════════════════
// Slash Commands
// ══════════════════════════════════════════
const commands = [
  // إعداد القناة
  new SlashCommandBuilder()
    .setName('setup-panel')
    .setDescription('تحديد قناة لوحة التيكتات')
    .addChannelOption(o => o.setName('channel').setDescription('القناة').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup-log')
    .setDescription('تحديد قناة اللوق')
    .addChannelOption(o => o.setName('channel').setDescription('القناة').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup-category')
    .setDescription('تحديد كاتيغوري التيكتات في السيرفر')
    .addChannelOption(o => o.setName('category').setDescription('الكاتيغوري').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup-role')
    .setDescription('تحديد رتبة الدعم')
    .addRoleOption(o => o.setName('role').setDescription('رتبة الدعم').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup-adminrole')
    .setDescription('تحديد رتبة الاداري (يغلق التيكت)')
    .addRoleOption(o => o.setName('role').setDescription('رتبة الاداري').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup-userclose')
    .setDescription('هل يقدر صاحب التيكت يغلقه؟')
    .addBooleanOption(o => o.setName('allow').setDescription('true = نعم / false = لا').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // إدارة الأقسام
  new SlashCommandBuilder()
    .setName('addcategory')
    .setDescription('إضافة قسم للتيكتات')
    .addStringOption(o => o.setName('name').setDescription('اسم القسم').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('إيموجي القسم').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('removecategory')
    .setDescription('حذف قسم من التيكتات')
    .addStringOption(o => o.setName('name').setDescription('اسم القسم').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('listcategories')
    .setDescription('عرض جميع الأقسام')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // إرسال اللوحة
  new SlashCommandBuilder()
    .setName('sendpanel')
    .setDescription('إرسال لوحة التيكتات للقناة المحددة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // إدارة التيكتات
  new SlashCommandBuilder()
    .setName('close')
    .setDescription('إغلاق التيكت الحالي'),

  new SlashCommandBuilder()
    .setName('add')
    .setDescription('إضافة شخص للتيكت')
    .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)),

  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('إزالة شخص من التيكت')
    .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rename')
    .setDescription('تغيير اسم التيكت')
    .addStringOption(o => o.setName('name').setDescription('الاسم الجديد').setRequired(true)),

  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('عرض الإعدادات الحالية')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

// ══════════════════════════════════════════
client.once('ready', async () => {
  console.log(`✅ بوت التيكتات شغّال: ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.TICKET_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commands registered');
  } catch (e) { console.error(e); }
});

// ══════════════════════════════════════════
// معالجة الكوماندات والإنتركشنز
// ══════════════════════════════════════════
client.on('interactionCreate', async (interaction) => {

  // ══ Slash Commands ══
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // ── setup-panel ──
    if (commandName === 'setup-panel') {
      config.panelChannel = interaction.options.getChannel('channel').id;
      return interaction.reply({ content: `✅ قناة اللوحة: <#${config.panelChannel}>`, ephemeral: true });
    }

    // ── setup-log ──
    if (commandName === 'setup-log') {
      config.logChannel = interaction.options.getChannel('channel').id;
      return interaction.reply({ content: `✅ قناة اللوق: <#${config.logChannel}>`, ephemeral: true });
    }

    // ── setup-category ──
    if (commandName === 'setup-category') {
      config.ticketCategory = interaction.options.getChannel('category').id;
      return interaction.reply({ content: `✅ كاتيغوري التيكتات محددة`, ephemeral: true });
    }

    // ── setup-role ──
    if (commandName === 'setup-role') {
      config.supportRole = interaction.options.getRole('role').id;
      return interaction.reply({ content: `✅ رتبة الدعم: <@&${config.supportRole}>`, ephemeral: true });
    }

    // ── setup-adminrole ──
    if (commandName === 'setup-adminrole') {
      config.adminRole = interaction.options.getRole('role').id;
      return interaction.reply({ content: `✅ رتبة الاداري: <@&${config.adminRole}>`, ephemeral: true });
    }

    // ── setup-userclose ──
    if (commandName === 'setup-userclose') {
      config.allowUserClose = interaction.options.getBoolean('allow');
      return interaction.reply({ content: `✅ صاحب التيكت يقدر يغلقه: **${config.allowUserClose ? 'نعم' : 'لا'}**`, ephemeral: true });
    }

    // ── addcategory ──
    if (commandName === 'addcategory') {
      const name = interaction.options.getString('name');
      const emoji = interaction.options.getString('emoji') || '🎫';
      if (config.categories.find(c => c.name === name))
        return interaction.reply({ content: '❌ القسم موجود أصلاً.', ephemeral: true });
      const id = Date.now().toString();
      config.categories.push({ id, name, emoji });
      return interaction.reply({ content: `✅ تم إضافة قسم: ${emoji} **${name}**`, ephemeral: true });
    }

    // ── removecategory ──
    if (commandName === 'removecategory') {
      const name = interaction.options.getString('name');
      const before = config.categories.length;
      config.categories = config.categories.filter(c => c.name !== name);
      if (config.categories.length === before)
        return interaction.reply({ content: '❌ القسم غير موجود.', ephemeral: true });
      return interaction.reply({ content: `✅ تم حذف قسم: **${name}**`, ephemeral: true });
    }

    // ── listcategories ──
    if (commandName === 'listcategories') {
      if (config.categories.length === 0)
        return interaction.reply({ content: '📋 ما في أقسام بعد.', ephemeral: true });
      const list = config.categories.map((c, i) => `**${i+1}.** ${c.emoji} ${c.name}`).join('\n');
      return interaction.reply({ content: `**الأقسام:**\n${list}`, ephemeral: true });
    }

    // ── settings ──
    if (commandName === 'settings') {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ إعدادات بوت التيكتات')
        .addFields(
          { name: 'قناة اللوحة', value: config.panelChannel ? `<#${config.panelChannel}>` : 'غير محددة', inline: true },
          { name: 'قناة اللوق', value: config.logChannel ? `<#${config.logChannel}>` : 'غير محددة', inline: true },
          { name: 'كاتيغوري التيكتات', value: config.ticketCategory ? `<#${config.ticketCategory}>` : 'غير محددة', inline: true },
          { name: 'رتبة الدعم', value: config.supportRole ? `<@&${config.supportRole}>` : 'غير محددة', inline: true },
          { name: 'رتبة الاداري', value: config.adminRole ? `<@&${config.adminRole}>` : 'غير محددة', inline: true },
          { name: 'صاحب التيكت يغلق', value: config.allowUserClose ? 'نعم' : 'لا', inline: true },
          { name: 'الأقسام', value: config.categories.length > 0 ? config.categories.map(c => `${c.emoji} ${c.name}`).join('\n') : 'لا يوجد' },
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── sendpanel ──
    if (commandName === 'sendpanel') {
      if (!config.panelChannel)
        return interaction.reply({ content: '❌ حدد قناة اللوحة أول بـ /setup-panel', ephemeral: true });
      if (config.categories.length === 0)
        return interaction.reply({ content: '❌ أضف أقسام أول بـ /addcategory', ephemeral: true });

      const channel = await client.channels.fetch(config.panelChannel);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎫 نظام التيكتات')
        .setDescription('اختر القسم المناسب لفتح تيكت')
        .setTimestamp();

      const menu = new StringSelectMenuBuilder()
        .setCustomId('open_ticket_menu')
        .setPlaceholder('اختر القسم...')
        .addOptions(config.categories.map(c => ({
          label: c.name,
          value: c.id,
          emoji: c.emoji,
        })));

      const row = new ActionRowBuilder().addComponents(menu);
      await channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ تم إرسال اللوحة!', ephemeral: true });
    }

    // ── close ──
    if (commandName === 'close') {
      const ticket = openTickets.get(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ هذه القناة مو تيكت.', ephemeral: true });

      const isAdmin = config.adminRole && interaction.member.roles.cache.has(config.adminRole);
      const isSupport = config.supportRole && interaction.member.roles.cache.has(config.supportRole);
      const isOwner = ticket.userId === interaction.user.id && config.allowUserClose;

      if (!isAdmin && !isSupport && !isOwner)
        return interaction.reply({ content: '❌ ما عندك صلاحية إغلاق التيكت.', ephemeral: true });

      await interaction.reply({ content: '🔒 جاري إغلاق التيكت...' });
      await closeTicket(interaction.channel, ticket, interaction.user);
    }

    // ── add ──
    if (commandName === 'add') {
      const ticket = openTickets.get(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ هذه القناة مو تيكت.', ephemeral: true });

      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true
      });
      return interaction.reply({ content: `✅ تم إضافة <@${user.id}> للتيكت.` });
    }

    // ── remove ──
    if (commandName === 'remove') {
      const ticket = openTickets.get(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ هذه القناة مو تيكت.', ephemeral: true });

      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
      return interaction.reply({ content: `✅ تم إزالة <@${user.id}> من التيكت.` });
    }

    // ── rename ──
    if (commandName === 'rename') {
      const ticket = openTickets.get(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ هذه القناة مو تيكت.', ephemeral: true });

      const name = interaction.options.getString('name');
      await interaction.channel.setName(`ticket-${name}`);
      return interaction.reply({ content: `✅ تم تغيير الاسم.` });
    }
  }

  // ══ القائمة المنسدلة - فتح التيكت ══
  if (interaction.isStringSelectMenu() && interaction.customId === 'open_ticket_menu') {
    await interaction.deferReply({ ephemeral: true });

    const categoryId = interaction.values[0];
    const category = config.categories.find(c => c.id === categoryId);
    if (!category) return interaction.editReply({ content: '❌ القسم غير موجود.' });

    // تحقق لو عنده تيكت مفتوح
    const existing = [...openTickets.values()].find(t => t.userId === interaction.user.id);
    if (existing) {
      return interaction.editReply({ content: `❌ عندك تيكت مفتوح بالفعل.` });
    }

    config.ticketCounter++;
    const ticketNum = String(config.ticketCounter).padStart(4, '0');
    const guild = interaction.guild;

    // إعداد الصلاحيات
    const permOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ];

    if (config.supportRole) {
      permOverwrites.push({ id: config.supportRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }
    if (config.adminRole) {
      permOverwrites.push({ id: config.adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }

    // إنشاء القناة
    const ticketChannel = await guild.channels.create({
      name: `${category.emoji}-ticket-${ticketNum}`,
      type: ChannelType.GuildText,
      parent: config.ticketCategory || null,
      permissionOverwrites: permOverwrites,
    });

    openTickets.set(ticketChannel.id, {
      userId: interaction.user.id,
      category: category.name,
      number: ticketNum,
    });

    // رسالة داخل التيكت
    const ticketEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`${category.emoji} تيكت #${ticketNum}`)
      .addFields(
        { name: 'صاحب التيكت', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'القسم', value: `${category.emoji} ${category.name}`, inline: true },
        { name: 'تاريخ الفتح', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
      )
      .setDescription('مرحباً، سيتم الرد عليك قريباً. اشرح مشكلتك بالتفصيل.')
      .setTimestamp();

    const closeBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 إغلاق التيكت').setStyle(ButtonStyle.Danger),
    );

    await ticketChannel.send({
      content: `<@${interaction.user.id}>${config.supportRole ? ` <@&${config.supportRole}>` : ''}`,
      embeds: [ticketEmbed],
      components: [closeBtn],
    });

    await interaction.editReply({ content: `✅ تم فتح تيكتك: ${ticketChannel}` });
  }

  // ══ زر إغلاق التيكت ══
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    const ticket = openTickets.get(interaction.channelId);
    if (!ticket) return interaction.reply({ content: '❌ ما لقيت بيانات التيكت.', ephemeral: true });

    const isAdmin = config.adminRole && interaction.member.roles.cache.has(config.adminRole);
    const isSupport = config.supportRole && interaction.member.roles.cache.has(config.supportRole);
    const isOwner = ticket.userId === interaction.user.id && config.allowUserClose;

    if (!isAdmin && !isSupport && !isOwner)
      return interaction.reply({ content: '❌ ما عندك صلاحية إغلاق التيكت.', ephemeral: true });

    await interaction.reply({ content: '🔒 جاري إغلاق التيكت...' });
    await closeTicket(interaction.channel, ticket, interaction.user);
  }
});

// ══════════════════════════════════════════
// دالة إغلاق التيكت
// ══════════════════════════════════════════
async function closeTicket(channel, ticket, closedBy) {
  // جمع سجل المحادثة
  let transcript = `=== سجل التيكت #${ticket.number} ===\n`;
  transcript += `القسم: ${ticket.category}\n`;
  transcript += `صاحب التيكت: ${ticket.userId}\n`;
  transcript += `أغلقه: ${closedBy.tag}\n`;
  transcript += `التاريخ: ${new Date().toLocaleString('ar')}\n`;
  transcript += `${'='.repeat(40)}\n\n`;

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].reverse();
    for (const msg of sorted) {
      if (msg.author.bot) continue;
      transcript += `[${msg.createdAt.toLocaleTimeString('ar')}] ${msg.author.tag}: ${msg.content}\n`;
    }
  } catch {}

  // إرسال اللوق
  if (config.logChannel) {
    try {
      const logCh = await channel.guild.channels.fetch(config.logChannel);
      const logEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(`🔒 تم إغلاق تيكت #${ticket.number}`)
        .addFields(
          { name: 'صاحب التيكت', value: `<@${ticket.userId}>`, inline: true },
          { name: 'أغلقه', value: `<@${closedBy.id}>`, inline: true },
          { name: 'القسم', value: ticket.category, inline: true },
        )
        .setTimestamp();

      const buf = Buffer.from(transcript, 'utf-8');
      await logCh.send({
        embeds: [logEmbed],
        files: [{ attachment: buf, name: `ticket-${ticket.number}.txt` }]
      });
    } catch (e) { console.error(e); }
  }

  openTickets.delete(channel.id);
  await new Promise(r => setTimeout(r, 2000));
  await channel.delete();
}

client.login(process.env.TICKET_TOKEN);
